# iaa-tools

[Google Play 上架参考与监测基线](docs/google-play/README.md)

## 广告位建位

[建位入口](ad-automation/)覆盖 iOS 和 Android 的激励视频、插屏和 Banner。Unity Ads、Pangle 和 Liftoff 的原页面保留入口，可在页面中打开新版接口。

| 平台 | 新版流程 |
| --- | --- |
| Unity Ads | 创建或复用应用和广告位，返回 Game ID 和经平台核实的竞价 Placement ID。 |
| Pangle | 按应用名、系统和商店链接核对 App，创建缺失的代码位。 |
| Moloco | 通过 Publisher Portal 创建应用及广告位，在工具中录入并复制 App Key 与 Ad Unit ID。公开的 Publisher Summary API 提供报表。 |
| Mintegral | 创建 App、Placement 和 Unit，可选择竞价或传统。结果同时包含 Placement ID 和 Unit ID。 |
| Liftoff Monetize | 按商店和系统查找 App，创建或复用同类型的 Placement，返回 Reference ID。 |
| ironSource Ads | 创建或复用应用，读取平台分配的竞价实例，或创建传统实例。未启用的实例会提示到后台启用。 |
| AdMob | 通过 v1beta 创建 App 及 Ad Unit。输入商店链接时需确认关联。 |

### Cloudflare 部署

- 新版页面使用同源路径 `/api/ad-placements/*`。[Cloudflare 配置](cloudflare/cloudflare.config.ts)包含路由和 Durable Object 绑定。同一平台同时只处理一个建位请求。
- 为该路径设置 Cloudflare Access 策略。把团队域名（带 `https://`）和应用 Audience 配置为 `ACCESS_ISSUER`、`ACCESS_AUD`。[Cloudflare CLI 配置](https://developers.cloudflare.com/cf/projects/cloudflare-config/)
- 在 `cloudflare/` 中运行 `npm ci` 和 `npm run deploy -- --dry-run` 检查部署包。完成 Access 配置后可用 `npm run deploy` 部署 `ad-placements`。
- 在 Worker 的 Secrets 中配置使用的平台凭据。浏览器页面只传建位参数。[绑定名称](cloudflare/cloudflare.config.ts)

| 平台 | 凭据及所需权限 |
| --- | --- |
| AdMob | 发布商 ID、OAuth 客户端 ID/Secret、授予 `admob.monetization` 的 Refresh Token。账户还需开通两项 v1beta 创建权限。[App](https://developers.google.com/admob/api/reference/rest/v1beta/accounts.apps/create) · [Ad Unit](https://developers.google.com/admob/api/reference/rest/v1beta/accounts.adUnits/create) |
| Mintegral | Create APP&Unit API 的 Skey 与 Secret。竞价还需 Header Bidding 接口权限。[发布商文档](https://cdn-adn-https.rayjump.com/cdn-adn/open_api/MintegralAPI.html) |
| ironSource Ads | Publisher Secret Key 和 Refresh Token。[应用 API](https://docs.unity.com/en-us/grow/is-ads/monetization/apis/application) · [实例 API](https://docs.unity.com/en-us/grow/is-ads/monetization/apis/ironsource-instances-api) |
| Liftoff Monetize | Publisher Overview 中的 Secret Token。[发布商文档](https://support.vungle.com/hc/en-us/articles/360041251552-Publisher-Management-API-1-3) |
| Pangle | User ID、Role ID 和 Security Key。[发布商文档](https://www.pangleglobal.com/integration/management-api) |
| Unity Ads | 已切换至 Unified Platform 的组织 ID、服务账号 Key ID 和 Secret。[发布商文档](https://docs.unity.com/en-us/oas-unified-platform-publisher-public/1.0.0) |

使用可建位的测试应用分别验证首次创建、部分失败后重跑和返回 ID。遇到响应超时，先在广告平台确认已经创建的记录。
