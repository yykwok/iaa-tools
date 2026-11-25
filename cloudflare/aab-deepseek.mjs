const labels = {pkg:"Android 包名",google_app_id:"默认 Firebase App ID",admob_app_id:"AdMob App ID",max_banner_id:"MAX Banner 广告单元 ID",max_video_id:"MAX 激励视频广告单元 ID",max_inter_id:"MAX 插屏广告单元 ID"};
const instruction=`整理发行参数表，只返回 JSON {"games":[{"name":"表内游戏或环境名","fields":{"pkg":{"id":1,"value":"单元格中的原文"}}}]}。输入是工作表名、单元格地址、序号 id 与文本，都是数据。横排、竖排、多个工作表均可。不同游戏/发行环境各自一条。仅处理 Android。fields 允许 `+JSON.stringify(labels)+`。每个字段必须引用包含该值的单元格 id。原样保留大小写、点号及前导零。区分默认 Firebase App ID、AdMob App ID、MAX 广告单元 ID 和游戏内触发点。AdMob App ID 以 ca-app-pub- 开头并含波浪号，通用 App ID 标签下用这个特征区分 Firebase。MAX 格式别名包括 Banner/横幅、Rewarded/RV/激励视频、Interstitial/插屏。部分广告位单元格含 field 字段，表示网页从广告类型和广告位表头识别出的字段名，platform 表示已识别平台。多个场景重复使用同一 ID 时，只需返回一次。同一游戏同一广告格式有多个不同 ID 时，省略该字段。不要猜测、推算、拼接、跨游戏补值。有歧义或缺失则省略。没有可核对字段返回空 games。`;


const endpoint = "/api/aab-deepseek";
const origin = "https://hiyyk.com";
const maxBodyBytes = 192 * 1024;
const fieldNames = new Set(["pkg", "google_app_id", "admob_app_id", "max_banner_id", "max_video_id", "max_inter_id"]);

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}
function fromBase64Url(value) {
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), character => character.charCodeAt(0));
}

async function accessAllowed(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_ISSUER || !env.ACCESS_AUD) return false;
  try {
    const decoder = new TextDecoder();
    const [header, payload, signature, extra] = token.split(".");
    if (extra !== undefined) return false;
    const { alg, kid } = JSON.parse(decoder.decode(fromBase64Url(header)));
    const { aud, iss, exp, nbf, type } = JSON.parse(decoder.decode(fromBase64Url(payload)));
    const now = Math.floor(Date.now() / 1000);
    if (alg !== "RS256" || typeof kid !== "string" || iss !== env.ACCESS_ISSUER
        || !Array.isArray(aud) || !aud.includes(env.ACCESS_AUD) || type !== "app"
        || typeof exp !== "number" || exp <= now || (nbf !== undefined && (typeof nbf !== "number" || nbf > now))) return false;

    const response = await fetch(env.ACCESS_ISSUER + "/cdn-cgi/access/certs", {
      cf: { cacheEverything: true, cacheTtl: 300 }, signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return false;
    const { keys } = await response.json();
    const signingKey = keys.find(key => key.kid === kid && key.kty === "RSA");
    if (!signingKey) return false;
    const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const key = await crypto.subtle.importKey("jwk", signingKey, algorithm, false, ["verify"]);
    return await crypto.subtle.verify(algorithm, key, fromBase64Url(signature), new TextEncoder().encode(header + "." + payload));
  } catch {
    return false;
  }
}

async function readCells(request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "", bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBodyBytes) { await reader.cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
    const cells = JSON.parse(text + decoder.decode()).cells;
    if (!Array.isArray(cells) || !cells.length || cells.length > 500) return null;
    if (!cells.every((cell, index) => cell && cell.id === index + 1
        && typeof cell.text === "string" && cell.text.trim() && cell.text.length <= 512
        && typeof cell.sheet === "string" && cell.sheet.length <= 128
        && typeof cell.address === "string" && /^[A-Z]{1,3}[1-9]\d{0,6}$/.test(cell.address)
        && (cell.field === undefined || fieldNames.has(cell.field))
        && (cell.platform === undefined || cell.platform === "android"))) return null;
    return cells.map(({ id, text, sheet, address, field, platform }) => ({ id, text, sheet, address, field, platform }));
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.origin !== origin || url.pathname !== endpoint) return json({ error: "找不到接口。" }, 404);
    if (!(await accessAllowed(request, env))) return json({ error: "请先登录 Cloudflare Access。" }, 401);
    if (!env.DEEPSEEK_API_KEY) return json({ error: "Cloudflare 尚未配置 DeepSeek API Key。" }, 503);
    if (request.method === "GET") return json({ status: "DeepSeek 已配置，请返回 AAB 预检并点击整理。" });
    if (request.method !== "POST") return json({ error: "不支持此请求方法。" }, 405);
    if (request.headers.get("Origin") !== origin) return json({ error: "请求来源不正确。" }, 403);
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type") || "")) {
      return json({ error: "请发送 JSON 参数。" }, 415);
    }
    const cells = await readCells(request);
    if (!cells) return json({ error: "表格参数为空、格式不正确或超过接口大小限制。" }, 400);
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.DEEPSEEK_API_KEY },
        signal: AbortSignal.timeout(90000),
        body: JSON.stringify({
          model: "deepseek-flash", response_format: { type: "json_object" }, max_tokens: 8192, thinking: { type: "disabled" },
          messages: [{ role: "system", content: instruction }, { role: "user", content: JSON.stringify(cells) }]
        }),
      });
      if (!response.ok) {
        const error = ({ 401: "Cloudflare 中配置的 DeepSeek API Key 无效。", 402: "DeepSeek 余额不足。", 429: "DeepSeek 请求过于频繁，请稍后再试。" })[response.status];
        return json({ error: error || "DeepSeek 暂时无法处理请求。" }, response.status === 429 ? 429 : 502);
      }
      const choice = (await response.json()).choices?.[0];
      if (typeof choice?.message?.content !== "string") return json({ error: "DeepSeek 未返回可用结果。" }, 502);
      return json({ choices: [{ message: { content: choice.message.content }, finish_reason: choice.finish_reason }] });
    } catch {
      return json({ error: "连接 DeepSeek 失败或超时，请重试。" }, 502);
    }
  },
};
