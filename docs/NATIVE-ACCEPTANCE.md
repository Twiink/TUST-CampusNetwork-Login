# NetMate 2.0 原生重写实施与验收

日期：2026-10-29。原生实现及原界面日夜主题已进入远程发行验证。此文档区分源码实现、CI 编译/模拟测试与真实环境验收。

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

| 功能                   | 实现与自动检查                                                                                                                                               | 仍需的验收                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 各运营商认证协议       | Rust 请求参数/JSONP；Android 协议夹具与 JVM 回归                                                                                                             | 真实门户与运营商账号                                                        |
| 多账号失败接续         | Rust 链接顺序回归，Android 原有引擎回归                                                                                                                      | 实际门户失败/成功组合                                                       |
| 门户成功但无外网       | Rust 独立保留 authenticated 和 internetReachable；继续确认                                                                                                   | 网络中断、实际门户                                                          |
| 普通热点/同名 WiFi     | 安全类型、BSSID、地址身份校验；旧请求不得覆盖新状态                                                                                                          | 四平台实际网卡                                                              |
| 手动抢占/暂停          | 取消恢复任务；Windows/macOS 关联调用持锁至 OS 调用结束；注销先暂停                                                                                           | 连续系统切换与权限撤回                                                      |
| 启动/运行开关          | 四种组合与冷却心跳 Rust 回归；Android 引擎复用                                                                                                               | 设备重启、自启授权                                                          |
| 监听与恢复             | WLAN、NetworkManager、CoreWLAN delegate、NetworkCallback；失效降级                                                                                           | 系统事件、睡眠唤醒、监听重建                                                |
| 日志                   | 7 天/20 MiB、索引/游标、筛选/完整流式导出、代次、队列丢弃计数                                                                                                | 长期压力与并发清空专项设备测试                                              |
| 更新                   | Ed25519 元数据、长度/摘要、流式下载、取消/重试、系统安装入口                                                                                                 | 正式签名、真实安装器、macOS 公证                                            |
| 天空主题界面及日夜开关 | 2026-10-30 四端按 `design/` 原型移植天空主题，日夜开关按 `design/toggle-lab.html`（结合「按钮-全月」与 themeswitch）重画并缩小到约 88×40；仅源码检查，待验证 | 新界面编译、截图、UI 自动化、开关动效后台停止与 CPU 占用 及实际设备视觉检查 |
| 生命周期               | 独立桌面 UI、Android Binder 订阅随可见性解除、UI 缓存释放                                                                                                    | 同批发行包两小时测试、设备重启                                              |

## 远程验证证据

[CI 40882814262](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/runs/40882814262)，源码 `91ebc07913dc9e66b710b525871cbcdd6d9dc43c`，已实际执行全部原生构建、单元测试、双主题截图和 100 次 UI 生命周期。该轮 Windows 两架构、Linux x64 和 Android 短测全部通过；macOS 打包后启动、Linux ARM64 前台内存失败，不能把整轮 CI 标为通过。

| 平台          | 已取得证据                                                                                             | 环境与限制                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Windows x64   | Rust 原生链接、100 次 UI、主题/输入保留、包、内存/CPU/启动通过                                         | Windows Server 2025 CI；Windows 11 x64 真实设备待验收                                   |
| Windows ARM64 | 同上                                                                                                   | Windows 11 ARM CI；实际无线硬件待验收                                                   |
| Linux x64     | Rust/clippy/核心测试、GTK AT-SPI、100 次 UI、DEB/RPM、短时性能通过                                     | Ubuntu 26.04 容器、Xvfb；GNOME/KDE 实桌面待验收                                         |
| Linux ARM64   | 原生构建、单元与 UI 测试、DEB/RPM通过                                                                  | 同环境；禁用 Cairo 无需的 GL/Vulkan 初始化后，Release 40888029593 前台 PSS/启动复验通过 |
| macOS ARM64   | Rust/Swift 原生链接、Swift 单测、XCTest 100 次 UI/主题通过                                             | macOS 27 CI；修复 ad-hoc entitlement 后，Release 40888029593 完整包后台/前台/启动通过   |
| Android       | 63 项 JVM 测试、真实 SQLite/Binder/引擎 instrumentation、主题/输入保留、100 次 Home/重开、短时性能通过 | API 37、Pixel 7 模拟器；真实设备待验收                                                  |

[Release 40888029593](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/runs/40888029593) 对源码 `6daaded6a23efa48cc3a897e859a87385eed2c3d` 重做全平台验证。短测全部通过后，直接下载本轮安装包执行两小时耐久，不另行构建替代二进制。该轮最终五个桌面组合短测通过，Android 启动门禁失败。后续 [Release 40891275465](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/runs/40891275465) 已使用静态 Windows C 运行库与 Google APIs Android 镜像；最终状态以对应流水线与发布页为准。

macOS 签名根因的独立证据来自 [40882815818](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/runs/40882815818)：同一 agent 去掉与其职责无关的 WiFi entitlement 后，退出码从 `-9` 变为持续运行，IPC 状态返回成功。受限 entitlement 只用于具有正式签名身份的 CoreWLAN 宿主；ad-hoc 发行明确显示降级，保留前台 2 秒/后台 15 秒的原有兜底频率。

## 本机执行边界和待验收项目

用户明确要求本机不执行构建和 E2E。本轮发布使用 GitHub Actions 产物，本机仅做源码检查、下载包的只读校验和提交。历史本机数据与构建 SHA 单列于 `NATIVE-PERFORMANCE.md`；不与当前发行源码混用。

以下项目仍需专用设备验证：四平台真实网卡/校园门户、多运营商账号、权限撤回、实际设备休眠与重启、自启授权、真实安装更新；Linux GNOME/KDE 与稳定版/LTS 桌面矩阵；GPU 单独分配与实际功耗；恢复压力下的两小时运行。CI 空配置耐久不能替代真实门户恢复压力测试。

## 发行和退役条件

版本由根 Cargo 工作区定义。Windows x64/ARM64 EXE、Linux x64/ARM64 DEB/RPM、macOS ARM64 ZIP/DMG、Android 单 APK 均有打包入口。本轮安装包全部由远程 CI 生成；本机历史产物不进入发行附件。

本地未配置正式更新源/公钥的构建会明确报告未配置，不接受未签名清单。发行工作流核验更新源和匹配的 Ed25519 密钥，检查全平台附件后生成草稿。Android 使用既有发行证书；当前 macOS 为 ad-hoc 签名、未公证，Windows 未作 Authenticode 签名。更新清单的 Ed25519 签名与平台安装器签名分别校验，不相互替代。用户已授权公开发布，公开前核对附件、摘要和最终 CI 结论。

按照已批准的顺序，原生平台验收通过后才删除旧运行时源码、补丁和构建依赖。当前旧代码保留在仓库内，默认产品构建和新发布链路已经切换。历史测试仍可用来定位移植语义，协议夹具继续保留。

## Android 渲染专项

[启动诊断 40891222278](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/runs/40891222278) 的 API 37 Google APIs 镜像仍未通过启动门禁：P95 4152ms。Perfetto 轨迹记录首帧 DrawFrames 约 1958ms、其中 Ganesh 命令执行约 1439ms，不能单纯归因于商店更新。当前修改将 MainActivity 选择为原生软件 Canvas 绘制，保留页面控件/日夜绘图；已通过 XML 源码检查，尚待提交后的远程构建、100 次生命周期、滚动/截图和性能验证。没有在本机运行新 UI 或构建。
