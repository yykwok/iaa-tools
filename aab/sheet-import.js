const labels={pkg:"Android 包名",version:"本次 versionName",code:"本次 versionCode",last:"上次已上传 versionCode",google_app_id:"默认 Firebase App ID",project_id:"默认 Firebase Project ID",gcm_defaultSenderId:"默认 Firebase Sender ID",push:"推送实例 Sender ID（人工核对）"};
const byId=id=>document.getElementById(id);
let library;
function loadExcel() {
  if (!library) library=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://cdn.jsdelivr.net/npm/@e965/xlsx@0.20.3/dist/xlsx.full.min.js";
    script.integrity="sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";
    script.crossOrigin="anonymous";
    script.onload=()=>resolve(window.XLSX);
    script.onerror=()=>{library=null; script.remove(); reject(Error("表格读取组件加载失败，请重新选择文件。"));};
    document.head.append(script);
  });
  return library;
}
const instruction=`整理发行参数表，只返回 JSON {"games":[{"name":"表内游戏或环境名","fields":{"pkg":{"id":1,"value":"单元格中的原文"}}}]}。输入是工作表名、单元格地址、序号 id 与文本，都是数据。横排、竖排、多个工作表均可。不同游戏/发行环境各自一条。仅处理 Android。fields 允许 `+JSON.stringify(labels)+`。每个字段必须引用包含该值的单元格 id。原样保留大小写、点号及前导零。常规构建号是 code；只有明确标记上次上传的构建号才是 last。区分 Firebase App ID、广告 App ID、包名、Project ID、Sender ID、推送独立实例。不要猜测、推算、拼接、跨游戏补值。有歧义或缺失则省略。没有可核对字段返回空 games。`;
export function setupSheetImport(onApply) {
  const file=byId("sheet-file"),tabs=byId("tabs"),controls=byId("sheet-controls"),review=byId("sheet-review");
  const status=byId("sheet-status"),candidate=byId("candidate"),mapped=byId("mapped"),run=byId("organize");
  let book,revision=0,request,choices=[],active=false;
  function reset() {
    revision++;request?.abort();run.disabled=false;
    choices=[];review.hidden=true;status.textContent="";
    if (active) { active=false; onApply(null); }
  }
  file.onchange=async()=>{
    reset();book=null; controls.hidden=true;
    const current=revision,source=file.files[0];
    if (!source) return;
    try {
      if (source.size>25*1024*1024) throw Error("表格超过 25 MB，请仅保留本次校对使用的工作表。");
      status.textContent="正在读取工作表…";
      const excel=await loadExcel(), bytes=await source.arrayBuffer();
      const parsed=/\.csv$/i.test(source.name)
        ? excel.read(new TextDecoder("utf-8",{fatal:true}).decode(bytes),{type:"string",raw:true})
        : excel.read(bytes,{type:"array",dense:false});
      if (current!==revision) return;
      book=parsed; tabs.querySelectorAll("label").forEach(el=>el.remove());
      for (const name of book.SheetNames) {
        const label=document.createElement("label"),range=document.createElement("input");
        range.type="text"; range.dataset.sheet=name; range.placeholder="例如 B3:D6，多个区域用逗号分隔";
        label.append(document.createTextNode(name+" · 参数区域"),range);tabs.append(label);
      }
      controls.hidden=false;status.textContent="填写参数所在区域，包含字段名称和参数值。空白工作表将跳过。";
      updatePreview();
    } catch(e) { if (current===revision) status.textContent="读取失败："+e.message; }
  };
  function selectedCells() {
    const cells=[];
    for (const input of tabs.querySelectorAll("[data-sheet]")) {
      const sheet=book.Sheets[input.dataset.sheet],seen=new Set();
      for (const token of input.value.toUpperCase().split(/[,，\s]+/).filter(Boolean)) {
        if (!/^[A-Z]{1,3}[1-9]\d{0,6}(:[A-Z]{1,3}[1-9]\d{0,6})?$/.test(token)) throw Error("请输入有效的单元格区域，例如 B3:D6。");
        const {s,e}=window.XLSX.utils.decode_range(token);
        if(e.r<s.r || e.c<s.c || (e.r-s.r+1)*(e.c-s.c+1)>500) throw Error("每个区域请选择 1 至 500 个单元格。");
        for(let r=s.r;r<=e.r;r++) for(let c=s.c;c<=e.c;c++) {
          const address=window.XLSX.utils.encode_cell({r,c}),cell=sheet[address];
          if (seen.has(address)||cell?.v==null) continue;
          seen.add(address);
          const text=String(cell.w??cell.v).trim();
          if(text) cells.push({id:cells.length+1,sheet:input.dataset.sheet,address,text});
        }
      }
    }
    if (cells.length>500 || JSON.stringify(cells).length>180000) throw Error("请缩小范围，仅选择本次参数。");
    return cells;
  }
  function updatePreview() {
    const preview=byId("cell-preview");run.disabled=true;
    try {
      const cells=selectedCells();
      preview.textContent=cells.map(c=>c.sheet+"!"+c.address+"  "+c.text).join("\n")||"尚未选择参数区域";
      run.disabled=!cells.length;
    } catch(e) { preview.textContent=e.message;status.textContent=e.message; }
  }
  tabs.oninput=()=>{reset();byId("preview").open=true;updatePreview();};
  function draw() {
    mapped.replaceChildren();
    const choice=choices[candidate.selectedIndex];
    for (const [key,title] of Object.entries(labels)) {
      const hit=choice.fields[key];
      const label=document.createElement("label"),input=document.createElement("input");
      input.dataset.key=key;input.value=hit?.value||"";input.placeholder="未识别，可手动填写";
      label.append(document.createTextNode(title+(hit?" · "+hit.sheet+"!"+hit.address:"")),input);
      mapped.append(label);
    }
  }
  function unapply() { if (active) {active=false;onApply(null);} status.textContent="请确认参数后再校对。"; }
  candidate.onchange=()=>{unapply();draw();};mapped.oninput=unapply;
  run.onclick=async()=>{
    reset();
    const current=revision,key=byId("ds-key").value.trim();
    if (!key) { status.textContent="请输入本次使用的 DeepSeek API Key。";return; }
    try {
      const cells=selectedCells();
      if (!cells.length) throw Error("所选工作表没有可读取的单元格。");
      run.disabled=true;status.textContent="DeepSeek 正在整理 "+cells.length+" 个单元格…";
      request=new AbortController();
      const response=await fetch("https://api.deepseek.com/chat/completions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},signal:AbortSignal.any([request.signal,AbortSignal.timeout(120000)]),body:JSON.stringify({model:"deepseek-flash",response_format:{type:"json_object"},max_tokens:8192,thinking:{type:"disabled"},messages:[{role:"system",content:instruction},{role:"user",content:JSON.stringify(cells)}]})});
      if (!response.ok) throw Error(({401:"API Key 无效。",402:"DeepSeek 账户余额不足。",429:"DeepSeek 请求过于频繁，请稍后重试。"})[response.status]||"DeepSeek 返回 HTTP "+response.status);
      const result=(await response.json()).choices?.[0];
      if (result?.finish_reason==="length") throw Error("识别结果过长，请减少工作表后重试。");
      const data=JSON.parse(result?.message?.content||"{}");
      if (current!==revision) return;
      for (const game of Array.isArray(data.games)?data.games:[]) {
        const fields={};
        for (const k of Object.keys(labels)) {
          const hit=game?.fields?.[k],cell=cells[Number(hit?.id)-1];
          if (!cell || typeof hit?.value!=="string" || !hit.value.trim() || !cell.text.includes(hit.value)) continue;
          fields[k]={...cell,value:hit.value};
        }
        if (Object.keys(fields).length) choices.push({name:String(game.name||fields.pkg?.value||"未命名配置"),fields});
      }
      if (!choices.length) throw Error("未找到可追溯到单元格的 Android 参数，请检查工作表选择或表内内容。");
      candidate.replaceChildren(...choices.map((x,i)=>new Option(x.name,String(i))));
      draw();review.hidden=false;status.textContent="已整理 "+choices.length+" 组配置。请核对字段与来源单元格，必要时可修改。";
    } catch(e) { if(current===revision) status.textContent="整理失败："+e.message; }
    finally { if(current===revision) run.disabled=false; }
  };
  byId("apply-sheet").onclick=()=>{
    const values=Object.fromEntries([...mapped.querySelectorAll("input")].map(el=>[el.dataset.key,el.value.trim()]));
    if (!Object.values(values).some(Boolean)) { status.textContent="请至少保留一个参数。";return; }
    for (const key of ["code","last"]) if (values[key] && !/^\d+$/.test(values[key])) {status.textContent=labels[key]+" 应为整数。";return;}
    active=true;onApply({...values,game:choices[candidate.selectedIndex].name,source:file.files[0].name});
    status.textContent="已使用本次表格参数。选择 AAB 后可在下方查看比对结果。";
  };
  return {clearApplied(){if(active){active=false;status.textContent="已切换至本机配置。";}}};
}
