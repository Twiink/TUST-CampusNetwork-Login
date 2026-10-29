# NetMate 2.0 原生重写实施与验收

日期：2026-10-29。状态：原生实现已接入，已按原界面恢复布局及日夜主题，平台编译/视觉验收待 CI。此文档区分实现、编译、模拟测试与真实环境验收。

## 基线和目录

重写前工作区（含未提交功能修复）的 Git 快照：`0b4d1f83ac33671608426c98e0cd3f6ca3c5747a`，引用 `refs/codex/baselines/native-rewrite-20261029`。当前 HEAD 与原暂存区没有被重置。快照可用 `git archive` 提取，不需要覆盖当前改动。

- `packages/netmate-platform`：解除 N-API 依赖的系统适配与路由/安全类型解析。
- `packages/netmate-core`：协议、认证、恢复、配置/凭据、SQLite 日志、签名更新。
- `apps/agent`：无界面后台、串行状态所有权、平台事件、托盘/自启、受控测试适配器。
- `apps/native-ui`：GTK4 与 Win32 控件，虚拟日志列表，按需独立进程。
- `apps/macos`：AppKit UI、CoreWLAN/位置权限/菜单栏宿主和测试目标。
- `apps/mobile/android`：原生 Activity、`:network` 进程、Binder、SQLite、Keystore、原生更新器。
- `tools/native`：打包、签名清单、正式包测量和原生 CI 工具。

## 行为验收矩阵

| 功能               | 实现与自动检查                                                                  | 仍需的验收                           |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------------------ |
| 各运营商认证协议   | Rust 请求参数/JSONP；Android 协议夹具与 JVM 回归                                | 真实门户与运营商账号                 |
| 多账号失败接续     | Rust 链接顺序回归，Android 原有引擎回归                                         | 实际门户失败/成功组合                |
| 门户成功但无外网   | Rust 独立保留 authenticated 和 internetReachable；继续确认                      | 网络中断、实际门户                   |
| 普通热点/同名 WiFi | 安全类型、BSSID、地址身份校验；旧请求不得覆盖新状态                             | 四平台实际网卡                       |
| 手动抢占/暂停      | 取消恢复任务；Windows/macOS 关联调用持锁至 OS 调用结束；注销先暂停              | 连续系统切换与权限撤回               |
| 启动/运行开关      | 四种组合与冷却心跳 Rust 回归；Android 引擎复用                                  | 设备重启、自启授权                   |
| 监听与恢复         | WLAN、NetworkManager、CoreWLAN delegate、NetworkCallback；失效降级              | 系统事件、睡眠唤醒、监听重建         |
| 日志               | 7 天/20 MiB、索引/游标、筛选/完整流式导出、代次、队列丢弃计数                   | 长期压力与并发清空专项设备测试       |
| 更新               | Ed25519 元数据、长度/摘要、流式下载、取消/重试、系统安装入口                    | 正式签名、真实安装器、macOS 公证     |
| 原界面及日夜主题   | 四项桌面侧栏、三项手机底部导航、原蓝色卡片；原生绘制太阳/月亮；主题切换保留输入 | 两套主题截图、实际平台布局和字体检查 |
| 生命周期           | 独立桌面 UI、Android Binder 订阅随可见性解除、UI 缓存释放                       | CI 100 次开关、两小时测试、后台重启  |

## 本机验证范围

本机 Ubuntu 26.04.1 LTS / x86_64。在用户更新执行约束前，23 项 Rust 核心/平台测试、63 项 Android JVM 测试、Linux clippy/Release、Android APK/测试 APK 及 Windows/macOS Rust 交叉类型检查曾通过。它们不覆盖随后还原的界面源码，也不能代替原生链接、Swift 编译或 UI 运行。

用户明确要求本机不执行构建和 E2E。此后仅执行 rustfmt 语法格式检查、Swift/Kotlin 独立语法解析、Android XML、Python 源码、YAML、actionlint 与差异检查；不启动界面、模拟器或编译器。CI 源码增加了双主题截图、主题持久化和未提交输入保留回归，尚未执行。

历史 Linux/Android 性能实测和构建 SHA 记录在 `NATIVE-PERFORMANCE.md` 以及 `dist-native/` 原始 JSON。当前 UI 未重新构建，原有安装包属于视觉修改前版本。所有历史测量使用独立配置，没有为测试修改当前 WiFi、校园网账号或用户数据。

以下验收尚无通过证据：Windows/macOS 实机运行；Swift/Xcode 编译与 XCTest；四平台真实无线、校园网、系统权限、自启和安装更新；GNOME/KDE 与当前 Ubuntu 稳定版/LTS 的完整矩阵；100 次 UI E2E；两小时耐久；逐平台 GPU 资源与实际功耗。CI 工作流已编写，但没有向 GitHub 推送或触发运行。

## 发行和退役条件

版本由根 Cargo 工作区定义。Windows x64/ARM64 EXE、Linux x64/ARM64 DEB/RPM、macOS ARM64 ZIP/DMG、Android 单 APK 均有打包入口。当前机器历史上生成过 Linux 和 Android 产物，本轮按用户要求未生成新安装包。

本地未配置正式更新源/公钥的构建会明确报告未配置，不接受未签名清单。发行工作流要求平台签名凭据与匹配的 Ed25519 密钥，检查全平台附件后生成可审阅草稿，不自动发布旧运行时产物。

按照已批准的顺序，原生平台验收通过后才删除旧运行时源码、补丁和构建依赖。当前旧代码保留在仓库内，默认产品构建和新发布链路已经切换。历史测试仍可用来定位移植语义，协议夹具继续保留。
