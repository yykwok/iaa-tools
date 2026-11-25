import {adFields} from "./ad-fields.js";
import {bindFilePicker} from "./file-picker.js";
import {setupSheetImport} from "./sheet-import.js?v=manual1";
const byId=id=>document.getElementById(id);
const games=byId("games"),form=byId("profile"),report=byId("report");
const conclusion=byId("conclusion");
const storageKey="yyk.aab.profiles.v1";
let profiles=[];
try { profiles=JSON.parse(localStorage.getItem(storageKey)||"[]"); if (!Array.isArray(profiles)) profiles=[]; } catch {}
function options(selected="") {
  games.length=1;
  for (const profile of profiles) games.add(new Option(profile.game,profile.game));
  games.value=selected;
  byId("profiles-help").textContent=profiles.length ? "选择配置可复用包名、构建号基准与 Firebase App ID。" : "暂无已保存配置。展开下方表单可添加常用游戏。";
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
let bundle=null,activeWorker=null,readError="";
const status=byId("current-state");
function load(file) {
  if (!file) return;
  activeWorker?.terminate();
  bundle=null;
  readError="";
  render();
  status.textContent="正在读取 "+file.name;
  const worker=new Worker("./worker.js?v=ads1",{type:"module"});
  activeWorker=worker;
  function finish(result,error) {
    if (activeWorker!==worker) return;
    worker.terminate(); activeWorker=null;
    bundle=result;
    readError=error;
    status.textContent=file.name+" · "+(error||"已读取");
    render();
  }
  worker.onmessage=({data})=>finish(data.result,data.error);
  worker.onerror=()=>finish(null,"读取失败，请使用支持本地解压的新版浏览器。");
  worker.postMessage(file);
}
bindFilePicker(byId("current"),load);
const attention=/^android\.permission\.(READ_PHONE_STATE|READ_PRIVILEGED_PHONE_STATE|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|ACCESS_(FINE|COARSE|BACKGROUND)_LOCATION|CAMERA|RECORD_AUDIO|READ_CONTACTS|WRITE_CONTACTS|READ_SMS|POST_NOTIFICATIONS|READ_MEDIA_.*)$/;
function render() {
  const profile = selected();
  conclusion.replaceChildren();
  report.replaceChildren();
  conclusion.hidden = !bundle && !readError;
  report.hidden = !bundle;
  if (readError) {
    conclusion.textContent = "预检未完成，AAB 读取失败。";
    conclusion.dataset.result = "error";
  }
  if (!bundle) return;

  const issues = [];
  const rows = [];
  let comparisonCount = 0;

  function match(title, actual, expected, required = false) {
    const issue = (!actual && (required || expected)) || (expected && actual !== expected);
    if (issue) issues.push(title);
    if (expected) comparisonCount++;
    const detail = expected ? " ｜ 预期 " + expected + " ｜ " + (issue ? (actual ? "不一致" : "未读取") : "一致") : "";
    rows.push([title + " · " + (actual || "未读取") + detail, Boolean(issue)]);
  }

  match("包名", bundle.pkg, profile?.pkg, true);
  match("版本名称", bundle.version);
  match("构建号", bundle.code, null, true);
  if (profile?.last) {
    const comparable = /^\d+$/.test(profile.last) && /^\d+$/.test(bundle.code);
    const higher = comparable && BigInt(bundle.code) > BigInt(profile.last);
    if (!higher) issues.push("构建号递增");
    comparisonCount++;
    rows.push(["上次已上传构建号 " + profile.last + " ｜ " + (higher ? "已递增" : comparable ? "未递增" : "无法比较"), !higher]);
  }
  const versions = rows.splice(0);
  match("App ID", bundle.firebase.google_app_id, profile?.google_app_id);
  if (!profile?.google_app_id) rows.push(["待提供预期 Firebase App ID。"]);
  const firebase = rows.splice(0);

  const pending = [];
  const ads = bundle.ads;
  const needsAds = adFields.some(({key}) => Boolean(profile?.[key]));
  const showAds = ads.appId || ads.source || ads.note || needsAds;
  if (showAds) {
    if (ads.note) {
      issues.push("广告配置");
      rows.push([ads.note, true]);
    }
    match("AdMob App ID", ads.appId, profile?.admob_app_id);
    if (ads.appId && !profile?.admob_app_id) pending.push("AdMob App ID");
    for (const {key, label, type} of adFields.filter(field => field.type)) {
      const codes = new Map();
      for (const placement of ads.units.filter(item => item.type === type)) {
        if (!codes.has(placement.code)) codes.set(placement.code, []);
        codes.get(placement.code).push(placement.id);
      }
      const expected = profile?.[key];
      if (!codes.size && !expected) continue;
      if (codes.size <= 1) {
        match(label, codes.keys().next().value, expected);
        if (!expected) pending.push(label);
      } else if (expected) {
        comparisonCount++;
        const found = codes.has(expected);
        if (found) pending.push(label + "与触发点的对应关系");
        else issues.push(label);
        rows.push([label + " ｜ 预期 " + expected + " ｜ " + (found ? "已找到，需复核对应关系" : "未找到"), !found]);
      } else {
        pending.push(label);
      }
      for (const [code, placements] of codes) rows.push(["包内配置 " + code + " ｜ " + placements.join("、")]);
    }
    if (!ads.units.length) rows.push(["当前支持的包内配置未读到广告单元 ID。"]);
  }
  const adRows = rows.splice(0);

  const permissions = new Map(bundle.permissions.map(p => [JSON.stringify([p.module, p.name, p.min, p.max]), p]));
  let attentionCount = 0;
  for (const p of permissions.values()) {
    const focus = attention.test(p.name);
    if (focus) attentionCount++;
    const range = p.min === 23 ? "API 23 起声明" : "普通声明";
    rows.push([[focus ? "重点关注" : "", p.name, p.module, range, p.max ? "上限 API " + p.max : "未声明上限"].filter(Boolean).join(" ｜ "), focus]);
  }
  if (!permissions.size) rows.push(["包内模块清单未声明权限。"]);
  if (profile?.notes) rows.push(["权限来源备注 · " + profile.notes]);

  if (!profile?.pkg) pending.push("包名");
  if (!profile?.google_app_id) pending.push("Firebase App ID");
  const title = document.createElement("h2");
  title.textContent = issues.length
    ? "包体预检发现问题，需核对" + issues.join("、") + "。"
    : "已检查项未发现异常"
      + (attentionCount ? "，另有 " + attentionCount + " 项权限需人工确认" : "")
      + (pending.length ? "，" + pending.join("、") + "待提供预期值" : "") + "。";
  conclusion.dataset.result = issues.length ? "error" : (attentionCount || pending.length ? "review" : "ok");
  conclusion.append(title);
  const context = document.createElement("p");
  context.textContent = bundle.file + (profile ? " ｜ " + profile.game : "") + (imported ? " ｜ " + imported.source : "")
    + " ｜ " + comparisonCount + " 项预期值校对";
  conclusion.append(context);

  function group(name, entries, note) {
    const section = document.createElement("section");
    section.className = "sheet";
    const heading = document.createElement("h2");
    heading.textContent = name;
    section.append(heading);
    if (note) {
      const description = document.createElement("p");
      description.textContent = note;
      section.append(description);
    }
    for (const [message, warn] of entries) {
      const item = document.createElement("div");
      item.className = warn ? "row warn" : "row";
      item.textContent = message;
      section.append(item);
    }
    report.append(section);
  }
  group("包名与版本", versions);
  group("Firebase 默认配置", firebase);
  if (showAds) group("广告配置", adRows, ads.source
    ? "游戏内触发点来源于 " + ads.source + "。AdMob App ID 来源于主模块清单。"
    : "AdMob App ID 来源于主模块清单。");
  group("清单权限 · " + permissions.size + " 项声明", rows, "重点关注由工具的固定名单标记，覆盖电话状态、媒体与存储、定位、相机、麦克风、联系人、短信读取和通知。请按游戏与 SDK 的实际用途核对。");
}
