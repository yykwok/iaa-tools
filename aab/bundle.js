// Read selected manifests, resources and ad configuration from a local File.
const utf8 = new TextDecoder();
const adConfigPath = "base/assets/definit.sm";
async function entries(file) {
  const tail = new Uint8Array(await file.slice(-65557).arrayBuffer());
  const view = new DataView(tail.buffer);
  let end = tail.length - 22;
  while (end >= 0 && !(view.getUint32(end,true) === 0x06054b50 && end + 22 + view.getUint16(end+20,true) === tail.length)) end--;
  if (end < 0) throw Error("文件不完整，或不是 ZIP 格式的 AAB。");
  const size = view.getUint32(end+12,true), offset = view.getUint32(end+16,true);
  if (size > 32*1024*1024 || offset+size > file.size) throw Error("无法读取 ZIP 目录（暂不支持 ZIP64）。");
  const bytes = new Uint8Array(await file.slice(offset,offset+size).arrayBuffer());
  const dir = new DataView(bytes.buffer), selected = new Map();
  for (let at=0; at<bytes.length;) {
    if (at+46>size || dir.getUint32(at,true)!==0x02014b50) throw Error("ZIP 文件目录损坏。");
    const u16 = n => dir.getUint16(at+n,true), u32 = n => dir.getUint32(at+n,true);
    const name = utf8.decode(bytes.subarray(at+46,at+46+u16(28)));
    if (/^[^/]+\/(?:manifest\/AndroidManifest\.xml|lib\/[^/]+\/[^/]+\.so)$/.test(name)
        || name==="BundleConfig.pb" || name==="base/resources.pb" || name===adConfigPath) {
      if (selected.has(name)) throw Error("包内存在重复的清单、资源表或广告配置。");
      selected.set(name,{offset:u32(42),packed:u32(20),size:u32(24),method:u16(10)});
    }
    at += 46+u16(28)+u16(30)+u16(32);
  }
  return selected;
}
async function openEntry(file, entry) {
  if (entry.offset+30>file.size) throw Error("包内文件头不完整。");
  const header = new DataView(await file.slice(entry.offset,entry.offset+30).arrayBuffer());
  if (header.getUint32(0,true)!==0x04034b50) throw Error("包内文件头无效。");
  const start = entry.offset+30+header.getUint16(26,true)+header.getUint16(28,true);
  if (start+entry.packed>file.size) throw Error("包内文件不完整。");
  let stream = file.slice(start,start+entry.packed).stream();
  if (entry.method===8) stream=stream.pipeThrough(new DecompressionStream("deflate-raw"));
  else if (entry.method!==0) throw Error("当前浏览器不支持此包的压缩方式。");
  return stream;
}
async function extract(file, entry) {
  const limit = 96*1024*1024;
  if (entry.size>limit || entry.packed>limit) throw Error("单个清单或资源表超过 96 MB。");
  const stream=await openEntry(file,entry);
  const reader=stream.getReader(), output=new Uint8Array(entry.size);
  let pos=0;
  for (;;) {
    const {value,done}=await reader.read();
    if (done) break;
    if (pos+value.length>output.length) { await reader.cancel(); throw Error("包内文件长度异常。"); }
    output.set(value,pos); pos+=value.length;
  }
  if (pos!==output.length) throw Error("包内文件不完整。");
  return output;
}
// Selected fields from AAPT2 Resources.proto. Byte fields remain views of the source.
function fields(bytes) {
  const result=new Map();
  if (!bytes) return result;
  let pos=0;
  function varint() {
    let value=0;
    for (let digit=0;digit<10 && pos<bytes.length;digit++) {
      const b=bytes[pos++]; value+=(b&127)*2**(digit*7);
      if (!(b&128)) return value;
    }
    throw Error("Protobuf 整数损坏。");
  }
  while (pos<bytes.length) {
    const key=varint(), type=key%8, id=Math.floor(key/8);
    let value;
    if (type===0) value=varint();
    else if (type===2) {
      const length=varint(); value=bytes.subarray(pos,pos+length); pos+=length;
    } else if (type===5 || type===1) pos+=type===5?4:8;
    else throw Error("无法识别清单或资源表编码。");
    if (!id || pos>bytes.length) throw Error("清单或资源表不完整。");
    if (!result.has(id)) result.set(id,[]);
    result.get(id).push(value);
  }
  return result;
}
const one=(m,n)=>m.get(n)?.[0];
const str=(m,n)=>utf8.decode(one(m,n));
const nested=(m,n)=>fields(one(m,n));

async function elfHeader(file, entry) {
  const size=Math.min(entry.size,64*1024);
  const output=new Uint8Array(size);
  const reader=(await openEntry(file,entry)).getReader();
  let position=0;
  try {
    while (position<size) {
      const {value,done}=await reader.read();
      if (done) throw Error("ELF 头部不完整。");
      const chunk=value.subarray(0,size-position);
      output.set(chunk,position);
      position+=chunk.length;
    }
    return new DataView(output.buffer);
  } finally {
    await reader.cancel();
  }
}

async function elfAlignment(file, entry) {
  const header=await elfHeader(file,entry);
  if (header.byteLength<64 || header.getUint32(0)!==0x7f454c46
      || header.getUint8(4)!==2 || ![1,2].includes(header.getUint8(5))) return null;
  const little=header.getUint8(5)===1;
  const offset=Number(header.getBigUint64(32,little));
  const stride=header.getUint16(54,little);
  const count=header.getUint16(56,little);
  if (offset<64 || stride<56 || !count || offset+stride*count>header.byteLength) return null;
  let minimum=null;
  for (let index=0;index<count;index++) {
    const position=offset+index*stride;
    if (header.getUint32(position,little)!==1) continue; // PT_LOAD
    const alignment=header.getBigUint64(position+48,little);
    if (minimum===null || alignment<minimum) minimum=alignment;
  }
  return minimum===null ? null : minimum>=16384n;
}

async function inspectNativeLibraries(file, entries) {
  const report={nativeCount:0,checked:0,unaligned:[],unreadable:[],zipAlignment:""};
  for (const [path,entry] of entries) {
    if (!/\/lib\/[^/]+\/[^/]+\.so$/.test(path)) continue;
    report.nativeCount++;
    if (!/\/lib\/(?:arm64-v8a|x86_64)\//.test(path)) continue;
    let compatible=null;
    try { compatible=await elfAlignment(file,entry); } catch {}
    if (compatible===null) report.unreadable.push(path);
    else {
      report.checked++;
      if (!compatible) report.unaligned.push(path);
    }
  }
  const config=entries.get("BundleConfig.pb");
  if (!report.nativeCount || !config || config.size>1024*1024 || config.packed>1024*1024) return report;
  try {
    // BundleConfig.optimizations.uncompress_native_libraries, per bundletool config.proto.
    const libraries=nested(nested(fields(await extract(file,config)),2),2);
    const alignment=one(libraries,2);
    const mode=one(libraries,1);
    if (mode===0) report.zipAlignment="compressed";
    else report.zipAlignment=({1:"4K",2:"16K",3:"64K"}[alignment] || "");
  } catch {}
  return report;
}
function itemValue(item) {
  for (const n of [2,3,4]) if (item.has(n)) return str(nested(item,n),1);
  const prim=nested(item,7);
  for (const n of [6,7]) if (prim.has(n)) return String(one(prim,n));
  if (item.has(1)) return {ref:one(nested(item,1),2) ?? str(nested(item,1),3)};
  return "";
}
function resources(bytes) {
  const values=new Map();
  for (const pkg of fields(bytes).get(2) || []) {
    const pack=fields(pkg);
    for (const typeBytes of pack.get(3)||[]) {
      const type=fields(typeBytes);
      if (str(type,2)!=="string") continue;
      for (const entryBytes of type.get(3)||[]) {
        const entry=fields(entryBytes);
        for (const variant of entry.get(6)||[]) {
          const cfg=fields(variant);
          if (one(cfg,1)?.length) continue;
          const value=itemValue(nested(nested(cfg,2),4)), name="string/"+str(entry,2);
          const id=(one(nested(pack,1),1)||0)*16777216+(one(nested(type,1),1)||0)*65536+(one(nested(entry,1),1)||0);
          for (const key of [name,str(pack,2)+":"+name,id]) values.set(key,value);
        }
      }
    }
  }
  return function resolve(value) {
    const seen=new Set();
    while (value && typeof value==="object") {
      if (seen.has(value.ref)) return "";
      seen.add(value.ref); value=values.get(value.ref);
    }
    return value || "";
  };
}
function element(bytes,resolve) {
  const el=nested(fields(bytes),1), attrs=new Map();
  for (const attrBytes of el.get(4)||[]) {
    const attr=fields(attrBytes), ns=str(attr,1);
    const key=(ns==="http://schemas.android.com/apk/res/android"?"android:":ns)+str(attr,2);
    attrs.set(key,resolve(itemValue(nested(attr,6))) || str(attr,3));
  }
  return {name:str(el,3),attr:key=>attrs.get(key)||"",children:el.get(5)||[]};
}
async function readAdConfig(file, entry, packageName, ads) {
  if (!entry) return;
  try {
    if (entry.size > 1024 * 1024 || entry.packed > 1024 * 1024) throw Error("广告配置文件过大。");
    const config = JSON.parse(utf8.decode(await extract(file,entry)));
    if (!packageName || config.pack_name !== packageName) {
      ads.note = adConfigPath + " 的包名与主清单不一致，请核对广告配置。";
      return;
    }
    ads.source = adConfigPath;
    if (Array.isArray(config.ad_params)) {
      for (const placement of config.ad_params) {
        const { type, id, code } = placement ?? {};
        if (typeof id === "string" && typeof type === "string" && typeof code === "string"
          && /^[0-9a-f]{16}$/i.test(code)) ads.units.push({ type, id, code });
      }
    }
  } catch {
    ads.note = "无法解析 " + adConfigPath + " 的广告配置。";
  }
}
export async function inspect(file) {
  const dir=await entries(file), base="base/manifest/AndroidManifest.xml";
  if (!dir.has(base)) throw Error("未找到 base 模块清单，请选择 Android App Bundle（.aab）。");
  const table=dir.get("base/resources.pb"), resolve=resources(table && await extract(file,table));
  const result={permissions:[],firebase:{},ads:{appId:"",units:[]},play:{},file:file.name};
  for (const [path,entry] of dir) {
    if (!path.endsWith("AndroidManifest.xml")) continue;
    const root=element(await extract(file,entry),resolve);
    if (root.name!=="manifest") throw Error("无法解析模块清单："+path);
    if (path===base) Object.assign(result,{pkg:root.attr("package"),code:root.attr("android:versionCode"),version:root.attr("android:versionName")});
    for (const bytes of root.children) {
      const child=element(bytes,resolve);
      if (path===base && child.name==="uses-sdk") {
        result.play.minSdk=child.attr("android:minSdkVersion");
        result.play.targetSdk=child.attr("android:targetSdkVersion");
      }
      if (path===base && child.name==="application") {
        for (const metaBytes of child.children) {
          const meta=element(metaBytes,resolve);
          if (meta.name==="meta-data" && meta.attr("android:name")==="com.google.android.gms.ads.APPLICATION_ID") {
            result.ads.appId=meta.attr("android:value");
          }
        }
      }
      if (["uses-permission","uses-permission-sdk-23","uses-permission-sdk-m"].includes(child.name)) {
        result.permissions.push({name:child.attr("android:name"),min:child.name==="uses-permission"?1:23,max:child.attr("android:maxSdkVersion"),module:path.split("/")[0]});
      }
    }
  }
  for (const key of ["google_app_id","project_id","gcm_defaultSenderId"]) result.firebase[key]=resolve({ref:"string/"+key});
  await readAdConfig(file,dir.get(adConfigPath),result.pkg,result.ads);
  result.play.native=await inspectNativeLibraries(file,dir);
  return result;
}
