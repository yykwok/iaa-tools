# Google Play 监测基线

核验日期为 2026-11-25，时区为 Asia/Shanghai。重点覆盖面向 Google Play 的 Android 手机游戏。

| 检查主题 | 初始基线 | 官方来源 |
| --- | --- | --- |
| 政策变更与期限 | 2026-10-29 有一轮政策公告。持续核对后续公告、范围调整、延期和近期生效项目。 | [政策公告](https://support.google.com/googleplay/android-developer/announcements/13412212) · [政策期限](https://support.google.com/googleplay/android-developer/table/12921780) |
| 目标 API | 普通 Android 手机应用新上架或提交更新，从 2026-08-31 起须达到 API 36。已上架应用的新用户可见性另有 API 35 门槛。 | [目标 API 要求](https://support.google.com/googleplay/android-developer/answer/11926878) |
| 16 KB 内存页 | Google 官方说明覆盖目标 API 35 及以上、在 64 位设备上分发的应用，明确更新无法发布的起始日期为 2027-02-01。预检可分别读取 AAB 打包配置和 ELF 加载段对齐。 | [16 KB 兼容](https://developer.android.com/guide/practices/page-sizes) |
| 广告与儿童受众 | 核对包含广告声明、意外弹出的全屏插屏、广告 ID 申报，以及面向儿童时广告 SDK 的适用要求。 | [应用内容申报](https://support.google.com/googleplay/android-developer/answer/9859455) · [开发者计划政策](https://support.google.com/googleplay/android-developer/answer/18265346) · [Families 广告 SDK](https://support.google.com/googleplay/android-developer/answer/12918983) |
| 数据安全与隐私 | 申报覆盖应用和第三方 SDK 的数据处理。包内权限和 SDK 提供核对线索，发行需要结合实际数据行为与商店申报核验。 | [数据安全](https://support.google.com/googleplay/android-developer/answer/10787469) · [用户数据政策](https://support.google.com/googleplay/android-developer/answer/10144311) |
| 敏感权限 | 持续核对联系人、定位、照片与视频、短信与通话记录、前台服务以及 Android 17 相关声明的适用范围和生效日。 | [政策期限](https://support.google.com/googleplay/android-developer/table/12921780) · [2026-10-29 公告](https://support.google.com/googleplay/android-developer/answer/18100766) |
| Billing 与 IAP | Billing Library 7 的扩展期限为 2026-11-01。版本 8 的新应用及更新停止支持日期为 2027-08-31，延期至 2027-11-01。适用于使用 Play Billing 的项目。 | [Billing 版本停用时间](https://developer.android.com/google/play/billing/deprecation-faq) |
| 账号与上架 | 核对包名注册、开发者验证、测试资格及 Play Console 申报的新增要求。 | [政策期限](https://support.google.com/googleplay/android-developer/table/12921780) · [应用内容申报](https://support.google.com/googleplay/android-developer/answer/9859455) |

周报比较上次成功核对的结果，首次运行使用上述基线。优先报告新增、修订、延期及近期生效的要求，列出受影响的游戏、所需动作和官方出处。
