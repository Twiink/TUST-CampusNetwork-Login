# 测试与 CI

## 本地检查

本机允许 `pnpm test`、`pnpm test:network`、`pnpm type-check`、`pnpm lint`、`pnpm format:check` 和构建。Android JVM 单测可用 `bash gradlew :app:testDebugUnitTest`；构建 E2E 专用入口不等于执行 E2E。经本次授权，可运行隔离本地 E2E。Linux 使用 `bash shell/test-linux-e2e.sh`，启动独立 D-Bus、临时钥匙串和 Xvfb；不会使用个人配置。Android 与 CI 共用 `apps/mobile/e2e/run-ci.sh`，本地必须设置 `ANDROID_SERIAL=emulator-端口`，且 AVD 名称为 `netmate-v102-*`。所有 adb 和 Maestro 操作绑定该设备，不能使用个人模拟器或真机。

## GitHub Actions 门禁

`.github/workflows/ci.yml` 响应所有分支 push、PR 和 workflow_dispatch。

| 门禁               | 内容                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| quality            | lint、类型、普通测试、Prettier                                                     |
| network-simulation | 共享网络模拟和 netem 链路检查                                                      |
| desktop-build      | Windows/macOS/Linux Rust 测试、原生 API 加载和生产构建；macOS 执行 Darwin 专属用例 |
| desktop-e2e        | 三平台 Playwright；Linux 使用独立 D-Bus、真实 libsecret 和 xvfb                    |
| android-build      | JVM 单测、独立 E2E APK、instrumentation APK、同签名更高版本 APK、错误签名 APK      |
| android-e2e        | API 28/29/36，原生引擎集成测试和 Maestro 2.12.0 用户流程                           |
| acceptance         | 所有依赖 job 必须 success；失败、跳过和取消均不能通过                              |

## 桌面 E2E 边界

`apps/desktop/electron/e2e-main.ts` 是独立构建入口，安装无线硬件、受控 HTTP 门户、系统自启、更新器、日志保存对话框的适配器后导入正式 main。preload、IPC 注册、ConfigManager、账号选择、AuthService、重连编排、加密存储都运行正式代码。正式 main 不导入测试入口。

`pnpm test:e2e` 先构建 `dist-e2e` 和 shared，再运行 Playwright。每个场景使用隔离 userData；覆盖配置增删改、重启保留、扫描连接、账号回退、暂停恢复、冷却后重连和日志。失败归档 trace、截图、渲染错误与主进程日志。

清空日志用例先等待合并后的初始网络查询完成，清空 IPC 同时丢弃待发送批次；随后检查空态、导出按钮及新日志继续到达。Playwright 默认会追加 basic 密码存储参数，专用 Linux 测试入口恢复真实 libsecret；存储不可用分支另由回归验证。运行中的后台服务仍可追加新的诊断记录。

## Android E2E 边界

`e2e` build type 使用 `com.netmate.app.e2e`、debug 测试签名、内置 JS bundle，独立 PlatformRuntime 安装硬件和 HTTP 端点适配器；正式 debug/release Runtime 不安装测试端点。原生桥接、Keystore、日志、后台认证串行引擎、DownloadManager、包校验及安装权限流程保留真实实现。

CI 构建基础版本 1.0.2-e2e（10020）和同签名 1.0.3-e2e（10030），另准备错误签名的 APK。`run-ci.sh` 核验专用模拟器身份，先执行 instrumentation 并检查至少 7 项成功且无跳过，再执行 7 个 Maestro 用户流程。首个流程导出日志后，额外执行 1 项签名 instrumentation，读取实际私有文件并通过 FileProvider 校验分享内容，再复制到外部诊断目录供 CI 归档；E2E APK 保持不可调试和内置 bundle。覆盖账号/WiFi 增删改及重启保存、关联/重启暂停、扫描、连接、账号回退、失败后恢复、日志导出、下载中重启与取消/重试、错误签名拒绝、安装授权及安装后状态恢复。最终检查安装包版本码，避免把打开安装器误判成完成升级。

受控更新服务持续发送限速数据，跨应用重启保持 DownloadManager 下载，再通过页面执行取消和重试。

## 诊断与验收

桌面 artifact 为 `desktop-e2e-<os>`；Android 为 `android-e2e-api-<api>`，包括 Maestro JUnit、截图、logcat、门户请求证据及最终安装信息。JVM 报告独立归档。

当前缺陷映射及实际验证状态保存在 [REMEDIATION.md](./REMEDIATION.md)。自动化验证不使用真实账号，不承诺受控硬件适配器能覆盖实际网卡、真实校园网门户或厂商后台限制。

## v1.0.2 正式发布门禁

最终候选必须在同一 SHA 完整运行两轮 CI，所有矩阵 job 首次通过，无失败、跳过或重试后通过；master 最终提交也必须完成 CI。`shell/release-gate.mjs` 用 GitHub API 检查实际提交、版本、矩阵及 run_attempt，自动发布、手动发布和产物复用都执行同一门禁。

Release 工作流安装 Windows EXE、挂载 macOS DMG、解包 Linux AppImage 运行正式应用，验证版本、原生模块和测试入口隔离。Android 校验五个 APK 的正式签名、递增版本码、正式网络策略，并在独立模拟器上安装 v1.0.1、通过界面保存测试账号、覆盖升级新通用包并再次重启核验保留配置。安装包冒烟结果归档为 `release-smoke-*`。

全部附件先上传草稿。更新 YAML 的版本、文件名和 SHA-512 必须对应实际安装包；SHA256SUMS 覆盖所有附件。工作流下载草稿附件逐项校验，再设为 Latest 并核验公开下载地址。`validation.json` 保存目标 SHA 和两次验收 CI 链接。iOS、真实校园网和厂商保活仍须独立验证。
