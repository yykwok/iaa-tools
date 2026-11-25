export const adFields = [
  { key: "admob_app_id", label: "AdMob App ID", header: /^(?:admob|googlemobileads)(?:appid|应用id)$/, value: /^ca-app-pub-\d{16}~\d{10}$/ },
  { key: "max_banner_id", label: "MAX Banner 广告单元 ID", type: "banner", header: /^(?:(?:applovin)?max)?(?:banner|横幅)(?:广告单元|广告位|adunit|placement)?(?:id|code)$/, value: /^[0-9a-f]{16}$/i },
  { key: "max_video_id", label: "MAX 激励视频广告单元 ID", type: "video", header: /^(?:(?:applovin)?max)?(?:rewarded(?:video)?|reward|video|激励(?:视频)?)(?:广告单元|广告位|adunit|placement)?(?:id|code)$/, value: /^[0-9a-f]{16}$/i },
  { key: "max_inter_id", label: "MAX 插屏广告单元 ID", type: "inter", header: /^(?:(?:applovin)?max)?(?:interstitial|inter|插屏)(?:广告单元|广告位|adunit|placement)?(?:id|code)$/, value: /^[0-9a-f]{16}$/i },
];
