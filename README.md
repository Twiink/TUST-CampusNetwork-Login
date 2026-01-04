# NetMate

**NetMate** - 你的 WiFi 连接管家，一个跨平台的智能 WiFi 管理工具，支持 Windows、macOS 和 Android 平台，可选配校园网自动认证功能。

## 项目简介

NetMate 是一款专注于 **WiFi 连接管理**的智能工具，提供 WiFi 自动重连、优先级切换等核心功能。对于需要校园网认证的场景，还支持自动登录和掉线重连。

### 核心特性

#### 🔄 智能 WiFi 管理（核心功能）

- **三阶段自动重连**：WiFi 断开时自动重连
  1. **单WiFi重试**：对断开的WiFi进行N次重连尝试（可配置）
  2. **优先级切换**：失败后按优先级自动切换到备用WiFi
  3. **全面失败提示**：所有WiFi失败后显示详细的故障列表和建议
- **实时重连进度**：显示当前连接的WiFi、尝试次数（第N/M次）
- **WiFi优先级管理**：为每个WiFi设置优先级（1-99），自动选择最优网络
- **多WiFi配置**：支持配置多个WiFi网络，自动管理连接
- **连接状态监测**：1秒检测间隔，快速响应WiFi断开事件

#### 🎓 校园网认证（可选功能）

- **自动登录**：连接到配置的校园WiFi后自动完成认证
- **账户配置**：配置校园网账号、密码、登录网址以及服务商
- **掉线重连**：校园网认证失效后自动重新登录
- **多账户管理**：支持添加、切换多个校园网账户
- **服务商选择**：支持校园网/移动/联通/电信

#### 📊 网络监控与日志

- **心跳检测**：可配置间隔的网络连通性检测
  - WiFi连接时：显示详细的网络状态（延迟、信号强度等）
  - WiFi断开时：显示友好的暂停提示
- **启动检测**：打开软件时自动检测当前WiFi连接状态并显示
- **详细日志**：记录所有操作和状态变化，支持多级别日志（debug/info/success/warn/error）
- **自动管理**：7天保留期，最多500条，便于问题排查

#### ⚙️ 系统集成

- **开机自启**：支持系统开机自动启动
- **系统托盘**（桌面端）：最小化到系统托盘，快捷操作
- **系统通知**：重要事件推送通知

### 支持平台

| 平台    | 技术栈           | 状态           |
| ------- | ---------------- | -------------- |
| Windows | Electron + React | 已完成，待测试 |
| macOS   | Electron + React | 已完成，待测试 |
| Android | React Native     | 已完成，待测试 |

## 需求进度

详细需求文档请参阅 [docs/requirements.md](./docs/requirements.md)

### WiFi 管理功能

| 功能                 | 描述                                   | 完成 | 报错 |
| -------------------- | -------------------------------------- | :--: | :--: |
| 多 WiFi 配置         | 配置多个 WiFi 网络                     | [x]  | [ ]  |
| WiFi 优先级          | 设置 WiFi 连接优先级（1-99）           | [x]  | [ ]  |
| 启动时 WiFi 检测     | 打开软件时自动检测 WiFi 连接状态并显示 | [x]  | [ ]  |
| WiFi 三阶段自动重连  | 单WiFi重试 → 优先级切换 → 全面失败提示 | [x]  | [ ]  |
| WiFi 重连进度显示    | 实时显示当前WiFi、尝试次数（第N/M次）  | [x]  | [ ]  |
| 所有WiFi失败提示     | 显示详细故障列表和修复建议             | [x]  | [ ]  |
| 手动 WiFi 切换       | 用户可手动切换到其他配置的WiFi         | [x]  | [ ]  |
| WiFi 连接状态监测    | 1秒检测间隔，快速响应断开事件          | [x]  | [ ]  |

### 校园网认证功能

| 功能             | 描述                                   | 完成 | 报错 |
| ---------------- | -------------------------------------- | :--: | :--: |
| 多账户管理       | 添加、删除、切换账户                   | [x]  | [ ]  |
| 服务商选择       | 校园网/移动/联通/电信                  | [x]  | [ ]  |
| WiFi 认证类型    | 区分需要/无需校园网认证的 WiFi         | [x]  | [ ]  |
| WiFi 关联账号    | 需要认证的 WiFi 关联已配置的账号       | [x]  | [ ]  |
| 手动登录/登出    | 用户手动触发认证                       | [x]  | [ ]  |
| 校园网自动重连   | 认证失效后自动重新登录                 | [x]  | [ ]  |

### 网络监控功能

| 功能             | 描述                                   | 完成 | 报错 |
| ---------------- | -------------------------------------- | :--: | :--: |
| 心跳检测开关     | 手动开启/关闭心跳检测                  | [x]  | [ ]  |
| WiFi状态绑定     | 心跳检测与WiFi连接状态绑定             | [x]  | [ ]  |
| 心跳暂停提示     | WiFi断开时显示友好的暂停提示           | [x]  | [ ]  |
| 无账户状态提示   | 未配置账户时显示引导                   | [x]  | [ ]  |
| 运行日志         | 详细记录所有操作和状态变化，支持自动清理 | [x]  | [ ]  |
| 日志级别筛选     | 按级别筛选日志（debug/info/success/warn/error） | [x]  | [ ]  |
| 系统通知         | 重要事件推送通知                       | [x]  | [ ]  |

### 平台特性

| 功能     |      桌面端      |  移动端  | 完成 | 报错 |
| -------- | :--------------: | :------: | :--: | :--: |
| 开机自启 |     Electron     | Android  | [x]  | [ ]  |
| 系统托盘 |     Electron     |    -     | [x]  | [ ]  |
| 后台服务 |        -         | Android  | [x]  | [ ]  |
| 自动更新 | electron-updater | APK 下载 | [x]  | [ ]  |

### UI 组件

| 组件       | 描述                | 完成 | 报错 |
| ---------- | ------------------- | :--: | :--: |
| 图标集成   | lucide-react 图标库 | [x]  | [ ]  |
| 侧边栏图标 | 导航栏添加图标      | [x]  | [ ]  |
| 运行状态页 | 连接状态、网络信息  | [x]  | [ ]  |
| 配置设置页 | 账号管理、WiFi 配置 | [x]  | [ ]  |
| 运行日志页 | 日志查看和筛选      | [x]  | [ ]  |
| 关于页面   | 版本信息、更新检查  | [x]  | [ ]  |

## 技术架构

NetMate 采用**双重连机制架构**，将 WiFi 层和应用层完全解耦：

```
┌─────────────────────────────────────────────────────────────┐
│                        应用层 (Apps)                         │
├───────────────────────────┬─────────────────────────────────┤
│   Electron (Win/macOS)    │      React Native (Android)     │
│   - 系统托盘               │      - 后台服务                   │
│   - 开机自启               │      - WiFi 控制                 │
│   - 通知推送               │      - 通知推送                   │
│   ┌─────────────────────┐ │                                 │
│   │ WiFi 事件监听器      │ │      两个独立的自动重连机制：     │
│   │ (WiFi Layer)        │ │      1. WiFi自动重连（系统层）   │
│   │ - SSID变化检测(1s)  │ │      2. 校园网重连（应用层）     │
│   │ - 三阶段重连流程     │ │                                 │
│   │ - 优先级自动切换     │ │      通过状态变化事件协作        │
│   └─────────────────────┘ │      无直接依赖                  │
│   ┌─────────────────────┐ │                                 │
│   │ 校园网自动重连       │ │                                 │
│   │ (Auth Layer)        │ │                                 │
│   │ - 认证状态检测       │ │                                 │
│   │ - 指数退避重试       │ │                                 │
│   └─────────────────────┘ │                                 │
└───────────────────────────┴─────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     核心业务层 (Shared)                       │
├─────────────────────────────────────────────────────────────┤
│  - 登录协议 (AuthService) - 支持详细日志                     │
│  - 联网探测 (NetworkDetector) - 支持详细日志                 │
│  - 重试策略 (RetryPolicy)                                    │
│  - 日志模型 (Logger) - 7天自动清理，多级别日志                │
│  - 配置管理 (ConfigManager) - 支持详细日志                   │
│  - 账户管理 (AccountManager) - 支持详细日志                  │
│  - WiFi管理 (WifiManager) - 支持详细日志                     │
└─────────────────────────────────────────────────────────────┘
```

### 双重连机制说明

详细架构文档请参阅 [apps/desktop/RECONNECT_ARCHITECTURE.md](./apps/desktop/RECONNECT_ARCHITECTURE.md)

1. **WiFi 自动重连（系统层）**
   - **触发条件**：系统检测到 WiFi SSID 从存在变为 null（物理断开）
   - **三阶段流程**：
     - 阶段1：单WiFi重连（重试N次，间隔2s）
     - 阶段2：优先级切换（按优先级尝试其他WiFi，间隔1s）
     - 阶段3：全部失败（广播详细故障列表）
   - **监测频率**：1秒检测间隔，快速响应断开事件

2. **校园网自动重连（应用层）**
   - **触发条件**：心跳检测发现认证失效（WiFi已连接，但无法访问网络）
   - **重连策略**：指数退避，最多重试3次
   - **完全独立**：不触发WiFi切换，只负责认证层面的重连

3. **协作方式**
   - WiFi重连成功 → 触发网络状态更新 → 校园网重连检测到需要认证 → 自动登录
   - 两个机制通过状态变化事件协作，无直接依赖
   - 职责清晰：WiFi层管WiFi，认证层管认证

## 项目结构

```
NetMate/
├── apps/
│   ├── desktop/          # Electron 桌面应用 (Win/macOS)
│   └── mobile/           # React Native 移动应用 (Android)
├── packages/
│   └── shared/           # 共享核心业务包
├── docs/                 # 项目文档
└── shell/                # 参考脚本
```

详细的项目结构设计请参阅 [docs/architecture.md](./docs/architecture.md)

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8
- 桌面端：无额外要求
- 移动端：Android Studio、JDK 17

### 安装依赖

```bash
# 安装所有依赖
pnpm install
```

### 开发模式

```bash
# 启动桌面端开发
pnpm dev:desktop

# 启动移动端开发服务 (Metro Bundler)
pnpm dev:mobile
```

### 移动端 Android 启动指南

在 Windows 环境下运行 Android 应用，请确保已安装 JDK 17+ 和 Android Studio（含 SDK Platform-Tools）。

1. **启动模拟器或连接真机**
   - 模拟器：通过 Android Studio AVD Manager 启动。
   - 真机：通过 USB 连接并开启"USB 调试"模式。

2. **启动应用**
   在新的终端窗口中运行：

   ```bash
   pnpm android
   ```

   _注意：请确保 `pnpm dev:mobile` 已经在另一个窗口中运行。_

3. **常用命令**
   ```bash
   # 清理构建缓存 (如果构建失败)
   cd apps/mobile/android && ./gradlew clean
   ```

### 构建发布

```bash
# 构建桌面端应用
pnpm build:desktop

# 构建 Android 应用
pnpm android
```

## 配置说明

应用启动后，需要配置以下信息：

1. **账户信息**
   - 用户名：校园网账号
   - 密码：校园网密码
   - 登录地址：认证服务器地址（默认为学校配置）

2. **WiFi 设置**
   - WiFi 名称：需要自动连接的 WiFi SSID
   - WiFi 密码：WiFi 连接密码

3. **自动化设置**
   - 开机自启：是否开机自动运行
   - 轮询间隔：网络状态检测间隔（秒）
   - 自动重连：掉线后是否自动重连

## 登录协议

本项目基于学校认证系统的 HTTP 接口实现登录：

```
POST http://{auth_server}/eportal/portal/login
```

主要参数：

- `user_account`: 用户账号
- `user_password`: 用户密码
- `wlan_user_ip`: 用户 IPv4 地址
- `wlan_user_ipv6`: 用户 IPv6 地址（URL 编码）
- `wlan_user_mac`: MAC 地址
- `wlan_ac_ip`: AC 控制器 IP

## 开发指南

### 代码规范

```bash
# 代码格式化
pnpm format

# 代码检查
pnpm lint

# 类型检查
pnpm type-check
```

### 目录约定

- `packages/shared/src/services/` - 核心服务
- `packages/shared/src/utils/` - 工具函数
- `packages/shared/src/types/` - 类型定义
- `apps/desktop/electron/` - Electron 主进程
- `apps/desktop/src/` - 桌面端 UI
- `apps/mobile/src/` - 移动端 UI

## 故障排除

### Electron 安装失败

**问题表现：**

运行 `pnpm run dev:desktop` 时报错：

```
Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
```

**问题原因：**

Electron 在安装时需要下载平台特定的二进制文件（Windows 上是 electron.exe 及相关资源）。这个下载过程可能因以下原因失败：

1. 网络问题导致下载中断
2. 防火墙或代理拦截下载请求
3. 安装过程被意外中断
4. pnpm 缓存损坏

当 Electron 的 `dist` 文件夹和 `path.txt` 文件缺失时，应用无法找到 Electron 可执行文件路径，就会抛出该错误。

**解决方案：**

方法一：手动运行 Electron 安装脚本（推荐）

```bash
# 直接运行 Electron 的安装脚本
node node_modules/electron/install.js
```

方法二：删除并重新安装 Electron

```bash
# Windows PowerShell
rm -rf node_modules/electron
pnpm install

# Windows CMD
rmdir /s /q node_modules\electron
pnpm install
```

方法三：完全重新安装依赖

```bash
# 删除所有依赖并重新安装
rm -rf node_modules
pnpm install
```

**验证修复：**

成功修复后，`node_modules/electron` 目录下应包含：

- `dist/` 文件夹（包含 Electron 可执行文件）
- `path.txt` 文件（记录可执行文件相对路径）

再次运行 `pnpm run dev:desktop` 应能正常启动应用。

### 桌面端启动后出现乱码警告

**问题表现：**

启动后终端显示乱码：

```
[stderr] ����: û���ҵ����� "31500"��
```

**问题原因：**

这是 Windows 控制台编码问题导致的中文乱码，原文是"错误: 没有找到进程 31500"。这是 `vite-plugin-electron` 在开发模式下管理进程时的正常警告信息，表示在尝试清理旧的 Electron 进程时，进程已经退出。

**影响范围：**

这只是一个无害的警告信息，不影响应用正常运行和开发。可以安全忽略。

**消除乱码（可选）：**

如果希望正确显示中文，可以在终端中设置 UTF-8 编码：

```powershell
# PowerShell
chcp 65001
```

然后重新运行 `pnpm run dev:desktop`。

## 许可证

ISC License

## 相关链接

- [项目仓库](https://github.com/Twiink/TUST-Campusnet-Login)
- [问题反馈](https://github.com/Twiink/TUST-Campusnet-Login/issues)
