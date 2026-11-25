const admobId = /^ca-app-pub-\d{16}~\d{10}$/;
const maxId = /^[0-9a-f]{16}$/i;
const maxPlatform = "(?:applovinmax|applovin|max)?";
const adSuffix = "(?:广告单元|广告位|广告|位|adunit|placement)?(?:id|code|编号|代码)?";
const unitHeader = format => new RegExp("^" + maxPlatform + "(?:" + format + ")" + adSuffix + maxPlatform + "$");

export const adFields = [
  { key: "admob_app_id", label: "AdMob App ID", header: /^(?:(?:admob|googlemobileads|谷歌广告)(?:appid|applicationid|应用id|应用编号|id)?|(?:appid|applicationid|应用id)admob)$/, value: admobId },
  { key: "max_banner_id", label: "MAX Banner 广告单元 ID", type: "banner", header: unitHeader("banner|横幅"), value: maxId },
  { key: "max_video_id", label: "MAX 激励视频广告单元 ID", type: "video", header: unitHeader("rewarded(?:video)?|reward|rv|video|激励(?:视频)?"), value: maxId },
  { key: "max_inter_id", label: "MAX 插屏广告单元 ID", type: "inter", header: unitHeader("interstitial|inter|插屏"), value: maxId },
];
