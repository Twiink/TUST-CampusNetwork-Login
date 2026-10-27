# NetMate

**NetMate** 是一个跨平台 WiFi 连接管理器，支持 Windows、macOS、Linux 和 Android。它负责 WiFi 自动重连、优先级切换、网络状态监控和日志记录，并可选用校园网自动认证。

当前版本：**v1.0.1**

## 核心特性

### 智能 WiFi 管理

- **三阶段自动重连**：单个 WiFi 重试 → 按优先级切换备用 WiFi → 显示完整失败原因与处理建议
- **实时重连进度**：显示当前 WiFi、尝试次数和切换阶段
- **WiFi 优先级**：为每个网络设置 `1-99` 的优先级
- **多网络配置与编辑**：保存多个 WiFi，编辑密码、优先级、认证要求及关联账号顺序
- **附近网络**：刷新扫描结果，查看信号、安全类型与已保存状态，再选择添加或编辑
- **手动切换**：主动连接指定的已配置网络
- **连接状态监测**：桌面端基于系统 WiFi 事件监听；移动端基于 Android `NetworkCallback` 事件驱动，并在原生事件不可用时回退轮询

### 校园网认证（可选）

- 多账户添加、编辑、删除与切换；空密码保留原值
- 校园网 / 移动 / 联通 / 电信服务商选择
- WiFi 与账户关联，按认证需求自动登录
- 认证失效后自动重连
- 手动登录与登出；登出会持久暂停所有自动认证，直到主动恢复或再次手动登录
- 首页、托盘、前后台按 WiFi 关联顺序尝试账号，单个账号超时后继续备用账号

### 网络监控与日志

- 可配置心跳检测与网络延迟测量
- WiFi 断开时暂停心跳并显示提示
- 启动时自动检测当前网络状态
- `debug` / `info` / `success` / `warn` / `error` 多级别日志
- 桌面日志筛选、文件导出、打开日志目录
- Android 前台、后台与 JS 日志统一保存，支持重启查询、分页、筛选、清空与系统分享导出
- Android 保留 7 天，单文件最多 5 MB，最多 3 个历史文件；界面初次显示最近 500 条
- 凭据在日志入库、事件和导出前脱敏

### 系统集成

- 开机自启
- 系统通知
- 桌面端系统托盘与 `electron-updater` 自动更新
- Android 后台服务，以及应用内检查、下载进度、取消/重试、安装授权与已下载 APK 校验
- macOS / Windows / Linux 原生网络信息，失败时回退 TypeScript 实现

## 支持平台

| 平台    | 技术栈                  | 主要能力                                      |
| ------- | ----------------------- | --------------------------------------------- |
| Windows | Electron + React + Rust | WiFi 管理、托盘、开机自启、通知、自动更新     |
| macOS   | Electron + React + Rust | WiFi 管理、托盘、开机自启、通知、自动更新     |
| Linux   | Electron + React + Rust | WiFi 管理、托盘、开机自启、通知、自动更新     |
| Android | React Native + Kotlin   | WiFi 管理、后台服务、开机自启、通知、APK 更新 |

> 桌面端发布产物为 Windows EXE、macOS DMG/ZIP、Linux AppImage/DEB；Android 发布产物为按 ABI 拆分的 APK 及通用 APK。

## 技术架构

NetMate 使用 pnpm workspace 组织四个包：

- `apps/desktop`：Electron 主进程、React 渲染进程与桌面端集成
- `apps/mobile`：React Native UI、Android 原生 WiFi / 后台服务模块
- `packages/shared`：登录协议、网络探测、重试策略、配置、账户、WiFi 管理与日志
- `packages/native`：Rust 原生网络模块，优先提供三平台 WiFi 快照与网络信息

```text
┌───────────────────────────────┐   ┌───────────────────────────────┐
│ Electron (Windows/macOS/Linux)│   │ React Native (Android)        │
│ - 托盘 / 自启 / 通知          │   │ - 后台服务 / 通知             │
│ - WiFi 事件监听与切换         │   │ - NetworkCallback 事件        │
│ - 校园网认证调度              │   │ - 校园网认证调度              │
└──────────────┬────────────────┘   └──────────────┬────────────────┘
               │                                   │
               └───────────────┬───────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ packages/shared                                                 │
│ AuthService · NetworkDetector · RetryPolicy · Logger            │
│ ConfigManager · AccountManager · WifiManager                    │
└───────────────────────────────┬─────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ packages/native                                                 │
│ Rust WiFi / 网络信息实现，加载失败自动回退 TypeScript 路径       │
└─────────────────────────────────────────────────────────────────┘
```

### 双重连机制

1. **WiFi 自动重连（系统层）**
   - 系统检测到 WiFi 断开或 SSID 变化
   - 先重试当前 WiFi，再按优先级尝试其他配置网络
   - 全部失败时展示故障列表并调度下一轮，冷却为零仍至少等待 5 秒
2. **校园网自动重连（应用层）**
   - 心跳检测发现“WiFi 已连接但无法联网”
   - 使用指数退避策略重新认证，最多重试 3 次
   - 只处理认证层，不直接触发 WiFi 切换
3. **协作方式**
   - WiFi 重连成功后刷新网络状态，认证流程再判断是否需要登录
   - 两层通过状态变化协作，手动暂停认证不关闭 WiFi 自动关联

## 项目结构

```text
NetMate/
├── apps/
│   ├── desktop/              # Electron 桌面应用
│   └── mobile/               # React Native Android 应用
├── packages/
│   ├── native/               # Rust 原生网络模块
│   └── shared/               # 共享业务与协议
├── patches/                  # pnpm 依赖补丁
├── shell/                    # Git hooks、性能基准与发布脚本
├── .github/workflows/        # CI 与多平台 Release
├── .githooks/                # 版本化 Git hooks
└── pnpm-workspace.yaml
```

## 快速开始

### 环境要求

| 依赖    | 版本 / 说明                                                   |
| ------- | ------------------------------------------------------------- |
| Node.js | `22`（与 CI 一致）                                            |
| pnpm    | `10.27.0`（由根 `packageManager` 固定）                       |
| Rust    | stable，仅构建原生模块或运行完整 CI 检查时需要                |
| Android | JDK `17`、Android Studio、Android SDK 36、NDK `27.1.12297006` |
| 桌面端  | 无额外运行时要求；打包需安装对应平台工具链                    |

本仓库使用 `node-linker=hoisted` 和统一的 `pnpm-lock.yaml`。不要混用 `npm install` 或提交其他包管理器锁文件。

### 安装依赖

```bash
pnpm install
```

Android 构建还会安装 `@react-native/gradle-plugin` 的 pnpm 补丁，配置位于 `pnpm-workspace.yaml`，补丁文件位于 `patches/`。请使用仓库内的 pnpm 版本，确保补丁被正确应用。

### Git Hooks

首次开发时安装仓库钩子：

```bash
sh shell/install-git-hooks.sh
```

- **pre-commit**：对暂存源码执行 ESLint 和 Prettier 检查
- **commit-msg**：要求单行 `<scope>: <中文主题>` 格式
- **pre-push**：执行冻结安装、lint 与类型检查
- **post-merge**：钩子或依赖定义变化时自动刷新
- **pre-rebase**：保护 `master` / `main` / `release/*`

### 开发模式

```bash
# 桌面端
pnpm dev:desktop

# 移动端 Metro + shared 监听
pnpm dev:mobile

# 在模拟器或真机上运行 Android
pnpm android
```

Android 真机需要开启 USB 调试；模拟器可通过 Android Studio AVD Manager 启动。`pnpm android` 运行期间应保持 `pnpm dev:mobile` 的 Metro 服务可用。

### 构建

```bash
# 构建 shared 与桌面端
pnpm build

# 生成当前平台桌面安装包
pnpm dist

# 指定桌面平台
pnpm dist:win
pnpm dist:mac
pnpm dist:linux

# 构建 Android Release APK
pnpm dist:android
```

Android Release 签名通过 `ANDROID_KEYSTORE_FILE`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` 注入。未提供发布签名时，Release 构建会回退到调试签名，仅适合本地验证，不能用于正式分发。

### 质量检查

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm format:check

# 网络模拟回归
pnpm test:network
```

E2E 只在 GitHub Actions 执行，本机仅运行上述检查和构建。普通 `pnpm test` 不包含 E2E。

每次分支 push、PR 和手动触发 CI 均运行 Windows/macOS/Linux 的 Playwright E2E，以及 API 28/36 的 Android 原生集成测试与 Maestro 2.12.0 流程。桌面测试启动真实主进程、preload、IPC、服务与持久化；Android 使用独立应用 ID、测试签名和内置 JS bundle。只有无线硬件、外部门户、系统更新器等外部边界使用受控适配器。失败归档包含 trace、截图、主进程日志、Maestro 报告和 logcat。

E2E 独立入口为 `pnpm test:e2e`（桌面）和 `bash apps/mobile/e2e/run-ci.sh`（Android，要求 CI 环境及预先构建的 APK）。汇总验收门禁要求全部 job 成功；跳过、缺失或失败均不会通过。详细流程与验证范围见 [测试说明](./docs/TESTING.md) 和 [缺陷修复证据](./docs/REMEDIATION.md)。

Release 工作流仅在 master 的 push CI 成功后自动发布；发布版本来自 `apps/desktop/package.json`。

## 配置说明

应用启动后按需配置：

1. **账户信息**
   - 校园网账号与密码
   - 认证服务器地址
   - 服务商类型
2. **WiFi 设置**
   - SSID 与密码
   - 优先级（`1-99`）
   - 是否需要校园网认证及关联账户的尝试顺序
   - 每个 WiFi 的自动连接开关和手动连接入口
3. **自动化设置**
   - 开机自启
   - 心跳检测间隔
   - 自动重连与重试次数
   - 日志级别与自动清理

修改配置时，界面会显示保存/同步/失败状态。Android 在持久化和原生同步均确认后才显示生效，失败时可重试；编辑保留账号/WiFi ID 及关联。WiFi 密码留空保留，显式勾选清除才改为开放网络。

Android 10+ 连接使用系统建议和系统授权/网络选择，系统决定实际关联；提交请求后会等待目标 SSID 和地址就绪。Windows 为开放及个人密码网络创建当前用户 profile，企业认证使用系统已有配置。Android 更新完成后校验包名、版本与签名，再进入系统安装器。具体入口见 [功能说明](./docs/FEATURES.md)。

配置和日志包含个人网络信息，请勿将本地配置、日志或密钥提交到仓库。

## 登录协议

校园网认证基于学校 ePortal HTTP 接口：

```http
GET http://{auth_server}/eportal/portal/login?<认证参数>
```

主要参数：

- `user_account`：用户账号
- `user_password`：用户密码
- `wlan_user_ip`：用户 IPv4 地址
- `wlan_user_ipv6`：用户 IPv6 地址（URL 编码）
- `wlan_user_mac`：MAC 地址
- `wlan_ac_ip`：AC 控制器 IP

具体字段兼容、在线判定和注销行为以 `packages/shared/src/services/` 中的实现为准。

## 开发约定

- `packages/shared/src/services/`：核心服务
- `packages/shared/src/utils/`：工具函数
- `packages/shared/src/types/`：类型定义
- `apps/desktop/electron/`：Electron 主进程
- `apps/desktop/src/`：桌面端 UI
- `apps/mobile/src/`：移动端 UI
- `apps/mobile/android/app/src/main/java/`：Android 原生模块

提交信息必须为单行 `<scope>: <中文主题>`，例如 `mobile: 修复 Gradle 插件解析`。可用 scope 包括 `desktop`、`mobile`、`shared`、`ci`、`release`、`docs`、`chore`、`build`、`test`、`deps`、`repo`。

## 许可证

ISC License

## 相关链接

- [项目仓库](https://github.com/Twiink/TUST-CampusNetwork-Login)
- [问题反馈](https://github.com/Twiink/TUST-CampusNetwork-Login/issues)
- [更新日志](./CHANGELOG.md)
- [性能报告](./PERFORMANCE.md)
