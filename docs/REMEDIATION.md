# F1–F11 修复与验证记录

日期：2026-10-27。基线：v1.0.1 / `9e4b563`。实施分支：`codex/netmate-feature-completion`。

11 项缺陷均已修复，功能入口和长期回归已补齐。最终远程验收仍在进行，当前不能报告全平台通过。[分支 CI 记录](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/workflows/ci.yml?query=branch%3Acodex%2Fnetmate-feature-completion)。

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

| 检查                                      | 结果                                                  |
| ----------------------------------------- | ----------------------------------------------------- |
| shared 单元/集成                          | 115 项通过                                            |
| desktop 单元/组件                         | 185 项通过                                            |
| mobile 单元/组件                          | 16 套件、81 项通过                                    |
| native Node 加载路径                      | 2 项通过                                              |
| Android JVM                               | 32 项通过，0 跳过                                     |
| Darwin Rust                               | macOS runner 4 项通过，0 忽略                         |
| 全工作区类型、lint、Prettier              | 通过                                                  |
| 三平台原生 API 与桌面生产构建             | 通过                                                  |
| Windows/macOS/Linux 真实主进程 Playwright | 各 25 项通过，0 跳过、失败或重试通过                  |
| Android 原生 integration                  | API 28/36 引擎各 3 项通过；日志导出新增 1 项待 CI     |
| Android Maestro 2.12.0                    | 两档配置/认证流程通过；其余流程待下一轮验证，尚未验收 |
| 全平台 acceptance                         | 等待全部依赖成功，尚未验收                            |

桌面测试运行真实 main、preload、IPC、配置、认证和重连服务。Android 测试运行独立 E2E APK 的实际 React Native 页面、原生桥接、引擎、Keystore、持久存储、DownloadManager 与系统安装器。测试入口不进入正式发布构建。

Android 的 7 个顶层用户流程为：配置与认证、配置增删改及重启保存、重连失败、重连恢复、下载重启与取消、错误签名拒绝、同签名升级安装。基础测试包 `1.0.1-e2e / 10010`，更新包 `1.0.2-e2e / 10020`。最终通过 dumpsys 核验实际安装版本；日志导出读取实际生成的文件并检查测试密码未泄漏。每个流程的 JUnit 必须存在且没有失败、错误或跳过。

每次分支 push 和 PR 均触发完整矩阵。桌面 artifact 保留 Playwright 报告、trace、截图和主进程日志；Android 保留 Maestro JUnit、截图、控件树、logcat、门户证据、导出文件及安装信息。acceptance 对缺失、跳过、失败或取消的依赖一律拒绝通过。

## 验证边界

自动测试使用模拟账号、受控门户和无线硬件边界，验证实际业务链路。真实校园网、实际网卡与驱动、双网络真机路由、运营商开通条件和厂商后台保活需在对应设备与环境验证。iOS 不在本轮范围。
