# 测试与 CI

## 本地检查

本机允许 `pnpm test`、`pnpm test:network`、`pnpm type-check`、`pnpm lint`、`pnpm format:check` 和构建。Android JVM 单测可用 `bash gradlew :app:testDebugUnitTest`；构建 E2E 专用入口不等于执行 E2E。本机不启动 Playwright Electron、模拟器、instrumentation 或 Maestro。

## GitHub Actions 门禁

`.github/workflows/ci.yml` 响应所有分支 push、PR 和 workflow_dispatch。

| 门禁               | 内容                                                                               |
| ------------------ | ---------------------------------------------------------------------------------- |
| quality            | lint、类型、普通测试、Prettier                                                     |
| network-simulation | 共享网络模拟和 netem 链路检查                                                      |
| desktop-build      | Windows/macOS/Linux Rust 测试、原生 API 加载和生产构建；macOS 执行 Darwin 专属用例 |
| desktop-e2e        | 三平台 Playwright；Linux 使用 xvfb                                                 |
| android-build      | JVM 单测、独立 E2E APK、instrumentation APK、同签名更高版本 APK、错误签名 APK      |
| android-e2e        | API 28/36，原生引擎集成测试和 Maestro 2.12.0 用户流程                              |
| acceptance         | 所有依赖 job 必须 success；失败、跳过和取消均不能通过                              |

## 桌面 E2E 边界

`apps/desktop/electron/e2e-main.ts` 是独立构建入口，安装无线硬件、受控 HTTP 门户、系统自启、更新器、日志保存对话框的适配器后导入正式 main。preload、IPC 注册、ConfigManager、账号选择、AuthService、重连编排、加密存储都运行正式代码。正式 main 不导入测试入口。

`pnpm test:e2e` 先构建 `dist-e2e` 和 shared，再运行 Playwright。每个场景使用隔离 userData；覆盖配置增删改、重启保留、扫描连接、账号回退、暂停恢复、冷却后重连和日志。失败归档 trace、截图、渲染错误与主进程日志。

## Android E2E 边界

`e2e` build type 使用 `com.netmate.app.e2e`、debug 测试签名、内置 JS bundle，独立 PlatformRuntime 安装硬件和 HTTP 端点适配器；正式 debug/release Runtime 不安装测试端点。原生桥接、Keystore、日志、后台认证串行引擎、DownloadManager、包校验及安装权限流程保留真实实现。

CI 构建基础版本 1.0.1-e2e（10010）和同签名 1.0.2-e2e（10020），另准备错误签名的 APK。`run-ci.sh` 要求 `GITHUB_ACTIONS=true`，先执行 instrumentation 并检查实际成功测试数，再执行 Maestro。用户流程验证配置/关联/重启暂停、扫描、连接、账号回退、失败后恢复、日志导出、下载取消/重试、错误签名拒绝和安装授权。最终检查安装包版本码，避免把打开安装器误判成完成升级。

## 诊断与验收

桌面 artifact 为 `desktop-e2e-<os>`；Android 为 `android-e2e-api-<api>`，包括 Maestro JUnit、截图、logcat、门户请求证据及最终安装信息。JVM 报告独立归档。

当前缺陷映射及实际验证状态保存在 [REMEDIATION.md](./REMEDIATION.md)。自动化验证不使用真实账号，不承诺受控硬件适配器能覆盖实际网卡、真实校园网门户或厂商后台限制。
