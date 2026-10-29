# NetMate

校园网认证与 WiFi 连接管理。2.0 使用系统原生界面和独立后台，默认构建不包含 Electron、React Native、Hermes 或 JavaScript 运行时。

目前处于原生替代验收阶段。界面沿用原来的侧栏/底部导航、卡片及白天/黑夜主题，视觉依据见 [界面约定](docs/NATIVE-APPEARANCE.md)。按用户要求，当前工作区不在本机执行构建或 E2E；本轮界面源码仅完成静态检查，实际渲染与新安装包待 CI。Windows/macOS 原生运行、Swift 编译、四平台无线硬件和校园门户的验收状态见 [实施与验收记录](docs/NATIVE-ACCEPTANCE.md)。未运行的验收不视为通过。

| 平台                 | 界面                            | 后台                                           |
| -------------------- | ------------------------------- | ---------------------------------------------- |
| Windows 11 x64/ARM64 | Win32 原生控件                  | Rust、WLAN 事件、系统托盘                      |
| macOS 27 ARM64       | Swift AppKit                    | Rust、CoreWLAN 菜单栏宿主                      |
| Linux x64/ARM64      | GTK4，默认 Cairo 渲染           | Rust、NetworkManager D-Bus、StatusNotifierItem |
| Android 17 / API 37  | Kotlin、XML Views、RecyclerView | 独立 `:network` 服务、Binder/AIDL              |

桌面关闭窗口会退出界面进程；后台继续认证、心跳与恢复。自启直接启动后台。完整退出通过托盘/菜单栏或界面执行。Android 界面退到后台时解除订阅、释放页面数据，服务继续运行；系统可能保留界面缓存进程，测量会计入该进程。

保留多账号顺序认证、WiFi 优先级、安全类型/BSSID 匹配、启动与运行时独立开关、主动注销暂停认证、成功认证但无外网时继续确认、日志筛选/导出、通知、自启和签名更新。心跳默认仍为 30 秒。Android 的 WiFi 连接受系统授权和选择机制约束，界面会显示等待系统选择。

## 源码与 CI 构建

本节构建、打包及启动命令供 CI 或专用验收环境使用，当前本机任务不执行。已有 `dist-native/` 安装包来自界面还原前，不能用于确认当前视觉。

版本源是根目录 `Cargo.toml` 的 `workspace.package.version`。正式桌面包按架构构建；Android 输出一个 APK。无需安装 Node 或 pnpm 即可构建新产品。

Linux 需要 Rust stable、Python 3.11+、C 编译器、pkg-config、GTK4 >= 4.16、D-Bus 开发包。运行环境需要 NetworkManager 和 Secret Service；当前 Ubuntu 的安装命令：

```bash
sudo apt-get install build-essential pkg-config libgtk-4-dev libdbus-1-dev network-manager gnome-keyring python3
python3 tools/native/build.py --run
python3 tools/native/package.py --format deb
# 已安装 rpmbuild 的系统亦可输出 RPM
python3 tools/native/package.py --format rpm
```

Windows 安装 Rust MSVC 工具链、Visual Studio C++ Build Tools、Python、NSIS，执行：

```powershell
python tools/native/build.py --run
python tools/native/package.py --format exe
```

macOS 安装 Xcode 27、Rust、Python，执行：

```bash
python3 tools/native/build.py --run
python3 tools/native/package.py --format mac
```

Android 使用 JDK 17、Android SDK 37.0、Gradle wrapper：

```bash
bash apps/mobile/android/gradlew -p apps/mobile/android :app:testDebugUnitTest :app:assembleRelease
python3 tools/native/copy_apk.py
```

输出位于 `dist-native/`。没有发布签名环境变量的 Android Release 为**未签名 APK**；`assembleBenchmark` 生成调试证书签名、启用 R8 的性能验证包。正式签名通过 `ANDROID_KEYSTORE_FILE`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` 注入。macOS 使用 `APPLE_SIGNING_IDENTITY`；未配置时仅作 ad-hoc 签名，用于构建检查。

## 数据与权限

新版本全新初始化配置，不读取旧版数据。桌面目录分别为 `%LOCALAPPDATA%/NetMateNative`、`~/Library/Application Support/NetMateNative` 和 `$XDG_DATA_HOME/netmate-native`（默认 `~/.local/share/netmate-native`）。开发测量使用独立 `NETMATE_DATA_DIR`。

账号和 WiFi 密码保存到系统凭据存储，配置只保存引用；公开 IPC 不返回密码。密码编辑明确区分保留、替换和清空。桌面 socket/命名管道限制当前用户。Android 仅网络服务持有配置和 Keystore 加密数据。

日志使用 SQLite 索引分页，保留 7 天，内容预算 20 MiB，单页最多 200 条；数据库缓存、WAL、队列和导出另有限制。导出逐页流式写文件。详情和导出会脱敏密码字段。

## 测试、测量与发布

```bash
cargo test --locked -p netmate-core -p netmate-platform
cargo clippy --locked -p netmate-core -p netmate-agent -p netmate-ui -- -D warnings
cargo fmt --all -- --check
```

本轮本机只执行不产生产物的源码检查；上面的 Cargo 测试/编译检查命令也保留给 CI。原生 UI E2E 保持在 CI 或专用验收设备执行。`.github/workflows/ci.yml` 调用原生四平台构建与验证；平台适配器受控版本单独构建，不进入正式包。测试包含 AT-SPI、UI Automation、XCTest、Android instrumentation、日夜截图、主题切换输入保留与 100 次窗口生命周期。CI 尚未运行。测量方法和限制见 [性能记录](docs/NATIVE-PERFORMANCE.md)。

`.github/workflows/release.yml` 手动触发全平台构建、两小时检测并生成原生发布草稿。更新源、公钥由 `NETMATE_UPDATE_ENDPOINT`、`NETMATE_UPDATE_PUBLIC_KEY` 在编译时配置，私钥只用于 `tools/native/manifest.py` 签名元数据，不进入程序。发布前须完成平台签名、macOS 公证、实机授权与安装更新验收。

旧 Electron/RN 源码、旧依赖和协议测试夹具暂保留，作为功能基线；原生路径跨平台验收后再删除。根目录 `legacy:*` 命令仅用于历史行为对照，不进入新产品发布。实施前完整工作区快照为 `refs/codex/baselines/native-rewrite-20261029`，不改变原 HEAD 和用户暂存区。
