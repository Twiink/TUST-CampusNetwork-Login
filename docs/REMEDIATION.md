# v1.0.2 修复与验收记录

日期：2026-10-28。实施基线：`06c8821`；分支：`codex/netmate-release-hardening`。此前 F1–F11 的修复保留在文末，本轮 H1–H11 来自后续审查，属于不同触发条件。

| 编号 | 根因与修复                                                                                                                                                               | 长期回归                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| H1   | 加密不可用会保存明文；现在拒绝凭据持久化，Linux basic_text 同样拒绝。解密错误保留原文件，明文仅在钥匙串可用时原子迁移，文件和临时文件限制权限                            | 桌面 `store.test.ts`、`release-regressions.test.ts`；Linux E2E 使用真实隔离钥匙串                   |
| H2   | 网络切换后的重试及账号回退仍沿用旧身份；现在请求前、响应后和发布前校验网络与配置代次，暂停立即使旧任务失效                                                               | 桌面 `release-regressions.test.ts`、共享 AuthService 回归、真实门户 E2E                             |
| H3   | Windows 按 SSID 子串切分而误切 BSSID；改为完整 SSID 行分块，保留每个 BSSID 的信号与身份                                                                                  | 桌面 `release-regressions.test.ts`；E2E 注入原始命令输出后运行正式解析器                            |
| H4   | nmcli 按冒号直切破坏转义 SSID；扫描与网络详情复用转义解析器                                                                                                              | 桌面 `release-regressions.test.ts`                                                                  |
| H5   | Linux 忽略索引形式地址/DNS；兼容 IP4.ADDRESS[n]、IP4.DNS[n]，并修复 /0 掩码计算                                                                                          | 桌面 `release-regressions.test.ts` 与适配器测试                                                     |
| H6   | 正式 Android HTTP 白名单与自定义门户矛盾；正式策略允许合法 HTTP 门户，请求继续绑定 WiFi，更新源及下载入口独立限制 HTTPS                                                  | `PlatformHardeningIntegrationTest` 运行正式 XML 策略及真实 HTTP transport；E2E 不再覆盖网络策略 XML |
| H7   | 系统建议只增不删；集中对账、加密保存应用建议记录，启动恢复，删除/停用/密码修改撤销旧建议，拒绝时同步报错。自动规则和临时手动请求分别管理，断开/超时/配置变化清理临时请求 | `PlatformHardeningIntegrationTest`，API 29 删除重建与 API 30+ 系统集合对账                          |
| H8   | 密码网络固定构造 WPA2；安全类型、稳定 ID、BSSID 贯穿桥接与原生，支持开放、WPA2、WPA3/过渡，WEP/企业认证提示系统配置                                                      | JVM `ReleaseHardeningTest` 和原生平台集成矩阵                                                       |
| H9   | 前台周期检查不遵守开关；现在心跳只控制周期检查，首次/网络事件/回前台检查独立保留，变更取消并重排                                                                         | 移动端 `release-heartbeat.test.tsx`、`useAutoAuth.test.tsx`                                         |
| H10  | 新日志截断已展开历史，offset 在并发新增时漂移；改用时间戳+ID 游标，保留展开历史、按 ID 去重。清空通过代次、串行持久化和原生日志 generation 排除旧分页及迟到事件          | 移动端 `release-logs.test.tsx`、JVM `LogPaginationTest`                                             |
| H11  | 心跳间隔仅依赖启动 Intent，服务重建丢失；原生持久快照保存间隔，启动/重建/配置变更读取，Android 统一 15–300 秒并迁移旧值，桌面范围保持原约定                              | JVM `ReleaseHardeningTest`、`PlatformHardeningIntegrationTest` 缓存重建及前台设置回归               |

同名 WiFi 的共享匹配顺序为 BSSID、安全类型、普通 SSID，组内保留优先级。已知不匹配的规则不回退；缺少身份字段且存在更具体规则时停止自动认证。桌面和移动主页、自动认证及手动账号序列均消费身份字段。WPA2/WPA3 过渡规则接受系统实际协商的模式。

进一步审查修复：桌面主页遗漏安全类型参数、原生心跳修改后未立即重排、异步清空期间读回旧日志，以及 Playwright 默认 basic 密码参数掩盖 Linux 真实钥匙串行为。桌面手动切换和重试使用配置 ID，保留 BSSID，防止同名规则取错密码；旧 SSID 接口遇到多条配置拒绝猜测，重连计划保留每条同名候选，切换卡片只标记实际匹配的当前配置。Linux 连接命令传递 BSSID；Windows/macOS 在连接后核对指定接入点，不符则提示系统配置。相应服务、重连和主页测试覆盖这些路径。Android 建议对账忽略账号元数据，重复同步不重新提交建议；清除安全网络密码后撤销应用建议并交由系统保存的配置管理。

macOS 日志清空 E2E 等待明确的主进程初始化及首次网络推送完成，再清空待发送批次；清空后主动查询，检查该查询产生的日志，避免依赖偶发启动日志。新增发布门禁测试覆盖提交漂移、缺失矩阵、失败/跳过、重试、附件缺失、版本及校验和不一致。正式安装包冒烟使用独立临时用户目录。

Android 日志导出 E2E 等待系统分享面板的 `android:id/resolver_list` 出现后才返回，并等待应用导航恢复，防止异步启动分享面板晚于返回键而遮挡后续操作；实际导出文件仍由原生集成检查内容和脱敏。该时序问题在 master 的 API 36 回归中定位，失败运行不计入发布验收。

同轮 API 29 在用户流程开始前遇到 Maestro 随机端口 `44317` 绑定失败。Android 驱动实际监听设备端口，主机随机空闲端口可能与设备临时端口冲突；本地/CI E2E 和正式升级冒烟统一指定 `--driver-host-port 7001`，避开临时端口范围，详见 [Maestro #3684](https://github.com/mobile-dev-inc/Maestro/issues/3684)。不增加流程重试，任何失败仍由门禁拒绝。

本地验证包括共享 118、桌面 205、移动 84、原生加载 2、发布门禁 2 项普通测试及 17 项网络模拟；Android JVM 38 项及 Release Kotlin/E2E 编译通过。Linux 真实主进程 E2E 25/25；专用 Android API 36 模拟器通过 7 项原生引擎/平台集成、1 项日志导出及全部 7 个 Maestro 流程，并核验实际覆盖安装至 1.0.3-e2e / 10030。正式 Linux AppImage 启动、版本、原生模块和测试文件排除冒烟通过；DEB 版本及原生文件已核对。真实 v1.0.1 APK 的界面保存账号流程已在专用模拟器通过；正式签名覆盖升级由 Release 工作流验证。

最终发布以同一目标提交的两轮完整 CI、master CI 和 Release 安装包冒烟全部首次通过为准；证据通过公开 Actions、Release 的 `validation.json` 和 `release-smoke-*` artifact 保存。真实校园网、真实无线硬件连接及厂商后台保活尚未实机验证；自动化边界见 [TESTING.md](./TESTING.md)。

---

# F1–F11 修复与验证记录

日期：2026-10-27。基线：v1.0.1 / `9e4b563`。实施分支：`codex/netmate-feature-completion`。

11 项缺陷均已修复，功能入口和长期回归已补齐。下表保留已执行的功能验证证据；最终验收要求该分支最新提交的全平台门禁成功，状态见[分支 CI 记录](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/workflows/ci.yml?query=branch%3Acodex%2Fnetmate-feature-completion)。

## 缺陷与回归映射

| 编号 | 最终行为                                                                                                                         | 仓库内长期回归                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| F1   | Darwin 使用 libc 地址布局，按 sa_len、4 字节路由对齐与报文边界解析；原生结果逐字段校验和回退                                     | `packages/native/src/macos.rs`：4 项 ABI、网关及截断报文测试，在 macOS runner 执行；桌面 `wifi-adapter.test.ts`      |
| F2   | 配置、账号及 WiFi 修改进入串行 functional update 队列，revision 递增；Android 拒绝旧版本覆盖，界面等待落盘和原生确认，失败可重试 | 共享 `feature-regressions.test.ts`；移动 `AppContext.test.tsx`；两端编辑与重启保存 E2E                               |
| F3   | AppContext 统一网络快照，区分 WiFi 关联、认证和互联网；旧网络事件与异步结果不能覆盖新网络                                        | 移动 `AppContext.test.tsx`、`HomeScreen.test.tsx`；`NativeEngineIntegrationTest.kt`                                  |
| F4   | 全部候选失败后明确调度唯一下一轮；冷却为零仍最少退避 5 秒；关闭开关、WiFi 或服务取消任务                                         | 桌面 `wifi-event-listener.regressions.test.ts`、`regressions.spec.ts`；原生 integration；Android 重连失败/恢复 flows |
| F5   | 连接命令边界只返回安全说明和错误码；内存、文件、IPC、原生日志和导出统一脱敏                                                      | 共享 feature regressions；桌面 `wifi-switcher.test.ts`；`LogJournalTest.kt`；两端实际导出文件检查                    |
| F6   | Android 读取实际 WiFi Network，门户和连通性请求绑定 WiFi；前台手动及后台使用同一串行引擎                                         | 原生 `NetworkRoutingTest.kt`、LocalAddresses/policy 测试、`NativeEngineIntegrationTest.kt`；API 28/36 E2E            |
| F7   | 桌面首页、托盘与自动认证优先按 WiFi 的有效关联顺序尝试，无有效关联才使用当前账号                                                 | 共享 feature regressions；桌面 `auth-session.test.ts`；账号回退 E2E                                                  |
| F8   | 注销前持久暂停，失败仍暂停；跨重启保留，恢复或手动登录解除；Android 注销使用最近成功服务器                                       | 桌面 auth-session、移动 AppContext、原生 integration；注销/重启/恢复 E2E                                             |
| F9   | 单账号异常或超时记为失败并继续后续账号，耗尽后汇总失败                                                                           | 共享 feature regressions；原生 integration；两端账号回退 E2E                                                         |
| F10  | 保留四运营商，TypeScript 与 Kotlin 使用相同参数和 RFC3986 编码                                                                   | 两语言测试共同读取 `packages/shared/fixtures/portal-protocol.json`                                                   |
| F11  | Windows 等待目标 SSID、接口连接状态与有效 IP，超时后继续备用候选                                                                 | 桌面 wifi-switcher 单测；三平台重连 E2E 验证连接编排与硬件边界确认                                                   |

## 功能入口与证据

| 功能             | 入口与实现                                                                                                      | 回归覆盖                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 两端配置编辑     | 账号/WiFi 卡片“编辑”；保留 ID 和关联；空密码保留，明确清除才删除应用密码并保留安全类型                          | 共享编辑测试、移动 FeatureComponents、两端编辑/重启 E2E                                                   |
| 两端附近网络     | “扫描附近 WiFi”；刷新、信号、安全类型、已保存标记；选择后预填表单或编辑已保存网络                               | 扫描错误/重试组件测试；两端扫描、填写、保存与连接 E2E                                                     |
| Android 连接控制 | WiFi 卡片自动连接开关和“连接”；首页显示阶段、当前目标、尝试、冷却与失败清单                                     | 权限测试、原生 integration；API 28 legacy 与 API 36 suggestion 请求构造、手动连接和重连 flows             |
| Windows 首次连接 | 当前用户 profile 支持开放和个人密码网络；特殊字符编码；临时凭据文件 finally 清理；企业网络复用系统配置          | wifi-switcher 测试覆盖生成、编码、成功/失败清理、系统 profile 复用及异步连接确认                          |
| Android 持久日志 | 日志页 debug/info/success/warn/error、分页、清空、系统分享；JS/前后台统一保存；7 天、5 MB/文件、最多 3 历史文件 | JVM 轮转/保留/筛选/重启读取/导出脱敏；组件测试；E2E 检查实际导出内容                                      |
| Android 应用更新 | 设置页“应用更新”：检查、进度、取消、重试、重启恢复；APK 包名/版本/签名校验；安装授权和覆盖安装                  | JVM ApkPolicy 与版本码测试、组件测试；下载中重启、取消/重试、错误签名拒绝、同签名更高版本实际覆盖安装 E2E |

Android 12+ 精确/粗略定位联合申请，13+ 附近设备权限在引导、权限卡片及手动连接前检查，拒绝后提供重试。Android 10+ 的实际 WiFi 选择由系统授权和回调确认。

## 验证结果

本任务未在本机执行任何 E2E。本机只执行普通测试、静态检查及构建；所有 E2E 均在 GitHub Actions。

| 检查                                      | 结果                                             |
| ----------------------------------------- | ------------------------------------------------ |
| shared 单元/集成                          | 115 项通过                                       |
| desktop 单元/组件                         | 185 项通过                                       |
| mobile 单元/组件                          | 16 套件、81 项通过                               |
| native Node 加载路径                      | 2 项通过                                         |
| Android JVM                               | 34 项通过，0 跳过                                |
| Darwin Rust                               | macOS runner 4 项通过，0 忽略                    |
| 全工作区类型、lint、Prettier              | 通过                                             |
| 三平台原生 API 与桌面生产构建             | 通过                                             |
| Windows/macOS/Linux 真实主进程 Playwright | 各 25 项通过，0 跳过、失败或重试通过             |
| Android 原生 integration                  | API 28/36 引擎各 3 项、日志导出各 1 项通过       |
| Android Maestro 2.12.0                    | API 28/36 各 7 个流程通过，0 失败、错误或跳过    |
| 全平台 acceptance                         | 要求最新提交所有依赖成功，实际状态见分支 CI 记录 |

桌面测试运行真实 main、preload、IPC、配置、认证和重连服务。Android 测试运行独立 E2E APK 的实际 React Native 页面、原生桥接、引擎、Keystore、持久存储、DownloadManager 与系统安装器。测试入口不进入正式发布构建。

Android 的 7 个顶层用户流程为：配置与认证、配置增删改及重启保存、重连失败、重连恢复、下载重启与取消、错误签名拒绝、同签名升级安装。基础测试包 `1.0.1-e2e / 10010`，更新包 `1.0.2-e2e / 10020`。最终通过 dumpsys 核验实际安装版本；日志导出读取实际生成的文件并检查测试密码未泄漏。每个流程的 JUnit 必须存在且没有失败、错误或跳过。

Android 9 的归档解析需要同时请求 `GET_SIGNATURES` 才会实际采集证书；保留 `GET_SIGNING_CERTIFICATES` 读取当前证书和轮换历史。JVM 用例验证证书缺失及多签不匹配仍拒绝升级，API 28 的错误签名拒绝与实际覆盖安装已通过。

桌面功能证据：[Windows 25 项](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/runs/40497303788/job/122165882763)、[macOS 25 项](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/runs/40497303788/job/122165883113)、[Linux 25 项](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/runs/40497303788/job/122165882986)。Android 功能证据：[API 28](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/runs/40501201775/job/122182515764)、[API 36](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/runs/40501201775/job/122182515651)，每档均通过 3 项引擎、1 项日志集成和全部 7 个 Maestro 流程，并实际升级至 `1.0.2-e2e / 10020`。这些链接记录对应功能验证，完整提交是否验收仍由最新分支门禁判定。

每次分支 push 和 PR 均触发完整矩阵。桌面 artifact 保留 Playwright 报告、trace、截图和主进程日志；Android 保留 Maestro JUnit、截图、控件树、logcat、门户证据、导出文件及安装信息。acceptance 对缺失、跳过、失败或取消的依赖一律拒绝通过。

## 验证边界

自动测试使用模拟账号、受控门户和无线硬件边界，验证实际业务链路。真实校园网、实际网卡与驱动、双网络真机路由、运营商开通条件和厂商后台保活需在对应设备与环境验证。iOS 不在本轮范围。
