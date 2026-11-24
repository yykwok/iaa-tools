import {setupSheetImport} from "./sheet-import.js?v=auto1";
const byId=id=>document.getElementById(id);
const games=byId("games"),form=byId("profile"),report=byId("report");
const storageKey="yyk.aab.profiles.v1";
let profiles=[];
try { profiles=JSON.parse(localStorage.getItem(storageKey)||"[]"); if (!Array.isArray(profiles)) profiles=[]; } catch {}
function options(selected="") {
  games.length=1;
  for (const profile of profiles) games.add(new Option(profile.game,profile.game));
  games.value=selected;
}
options();
let imported=null;
function selected() { return imported || profiles.find(p=>p.game===games.value); }
const sheetImport=setupSheetImport(profile=>{
  imported=profile;
  if (profile) { games.value=""; form.reset(); }
  render();
});
games.onchange=()=>{
  imported=null; sheetImport.clearApplied();
  const profile=selected();
  for (const input of form.querySelectorAll("input")) input.value=profile?.[input.name]||"";
  byId("saved").textContent=""; render();
};
form.onsubmit=event=>{
  event.preventDefault();
  const data=Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,v.trim()]));
  if (!data.game || !data.pkg) { byId("saved").textContent="请填写游戏名称和包名。"; return; }
  const next=[...profiles.filter(p=>p.game!==data.game),data];
  try { localStorage.setItem(storageKey,JSON.stringify(next)); }
  catch { byId("saved").textContent="浏览器未能保存配置。"; return; }
  imported=null; sheetImport.clearApplied(); profiles=next; options(data.game); byId("saved").textContent="已保存到本机"; render();
};
let bundle=null,activeWorker=null;
const input=byId("current"),zone=input.parentElement,status=byId("current-state");
function load(file) {
  if (!file) return;
  activeWorker?.terminate();
  bundle=null;
  render();
  status.textContent="正在读取 "+file.name;
  const worker=new Worker("./worker.js",{type:"module"});
  activeWorker=worker;
  function finish(result,error) {
    if (activeWorker!==worker) return;
    worker.terminate(); activeWorker=null;
    bundle=result;
    status.textContent=file.name+" · "+(error||"已读取");
    render();
  }
  worker.onmessage=({data})=>finish(data.result,data.error);
  worker.onerror=()=>finish(null,"读取失败，请使用支持本地解压的新版浏览器。");
  worker.postMessage(file);
}
input.onchange=()=>{load(input.files[0]);input.value="";};
zone.ondragover=e=>{ e.preventDefault(); zone.classList.add("over"); };
zone.ondragleave=()=>zone.classList.remove("over");
zone.ondrop=e=>{ e.preventDefault();zone.classList.remove("over");load(e.dataTransfer.files[0]); };
const firebaseNames={google_app_id:"App ID",project_id:"Project ID",gcm_defaultSenderId:"Sender ID"};
const attention=/^android\.permission\.(READ_PHONE_STATE|READ_PRIVILEGED_PHONE_STATE|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|ACCESS_(FINE|COARSE|BACKGROUND)_LOCATION|CAMERA|RECORD_AUDIO|READ_CONTACTS|WRITE_CONTACTS|READ_SMS|POST_NOTIFICATIONS|READ_MEDIA_.*)$/;
function render() {
  const now=bundle,profile=selected();
  report.replaceChildren(); report.hidden=!now;
  if (!now) return;
  function line(text,warn=false,tag="div") {
    const node=document.createElement(tag); node.textContent=text;
    if (tag==="div") node.className="row"+(warn?" warn":"");
    report.append(node);
  }
  line("包名与版本",false,"h2");
  if (imported) line("本次校对基准 · "+imported.source+" ｜ "+imported.game);
  const match=(name,value,expected)=>{
    const state=expected ? (!value?"未读取，需核对":value===expected?"一致":"不一致") : "未设置预期";
    line(name+" · "+(value||"未读取")+" ｜ "+state+(expected?"（预期 "+expected+"）":""),Boolean(expected && expected!==value));
  };
  match("包名",now.pkg,profile?.pkg);
  if (profile?.version) match("预期 versionName",now.version,profile.version);
  if (profile?.code) match("预期 versionCode",now.code,profile.code);
  line("版本名称 "+(now.version||"未读取"));
  line("构建号 "+(now.code||"未读取"));
  function compareCode(label,base) {
    if (!/^\d+$/.test(base)||!/^\d+$/.test(now.code)) { line(label+" · 构建号缺失，无法比较",true); return; }
    const higher=Number(now.code)>Number(base);
    line(label+" "+base+" ｜ "+(higher?"已递增":"未递增，请核对"),!higher);
  }
  if (profile?.last) compareCode("上次已上传",profile.last);
  line("Firebase 默认配置",false,"h3");
  for (const [key,title] of Object.entries(firebaseNames)) {
    match(title,now.firebase[key],profile?.[key]);
  }
  const projectNumber=/^1:(\d+):android:/.exec(now.firebase.google_app_id)?.[1];
  if (projectNumber && now.firebase.gcm_defaultSenderId && projectNumber!==now.firebase.gcm_defaultSenderId) {
    line("默认 App ID 中的项目编号 "+projectNumber+" 与默认 Sender ID 不一致，请核对是否指向预期项目。",true);
  }
  if (profile?.push) line("推送实例 Sender ID 预期 "+profile.push+" ｜ 请人工核对运行时实例。");
  const identity=p=>JSON.stringify([p.module,p.name,p.min,p.max]);
  const current=new Map(now.permissions.map(p=>[identity(p),p]));
  line("清单权限 · "+current.size+" 项声明",false,"h3");
  for (const p of current.values()) {
    const highlight=attention.test(p.name);
    line([highlight?"重点关注":"",p.name,p.module,"API "+p.min+(p.max?"–"+p.max:" 起（未声明上限）")].filter(Boolean).join(" ｜ "),highlight);
  }
  if (!current.size) line("本次包的模块清单未声明权限。");
  if (profile?.notes) line("权限来源备注 · "+profile.notes);
}
