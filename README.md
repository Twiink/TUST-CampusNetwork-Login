# TUST Campus Network Login

一个跨平台的校园网自动登录工具，支持 Windows、macOS 和 Android 平台。

## 项目简介

本项目旨在解决校园网需要频繁手动登录的问题。通过配置账号密码和 WiFi 信息，应用可以在连接指定 WiFi 后自动完成登录认证，并支持掉线自动重连。

### 核心功能

- **账户配置**：配置校园网账号、密码及登录网址
- **WiFi 管理**：配置可连接的 WiFi 名称和密码
- **自动登录**：连接 WiFi 后自动完成认证
- **开机自启**：支持系统开机自动启动
- **轮询检测**：可配置检测间隔，定时检查网络状态
- **掉线重连**：检测到掉线后自动重新连接和登录

### 支持平台

| 平台 | 技术栈 | 状态 |
|------|--------|------|
| Windows | Electron + React | 开发中 |
| macOS | Electron + React | 开发中 |
| Android | React Native | 开发中 |

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                        应用层 (Apps)                         │
├───────────────────────────┬─────────────────────────────────┤
│   Electron (Win/macOS)    │      React Native (Android)     │
│   - 系统托盘              │      - 后台服务                  │
│   - 开机自启              │      - WiFi 控制                 │
│   - 通知推送              │      - 通知推送                  │
└───────────────────────────┴─────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     核心业务层 (Shared)                       │
├─────────────────────────────────────────────────────────────┤
│  - 登录协议 (AuthService)                                    │
│  - 联网探测 (NetworkDetector)                                │
│  - 重试策略 (RetryPolicy)                                    │
│  - 日志模型 (Logger)                                         │
│  - 配置管理 (ConfigManager)                                  │
└─────────────────────────────────────────────────────────────┘
```

## 项目结构

```
TUST-CampusNetwork-Login/
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
   *注意：请确保 `pnpm dev:mobile` 已经在另一个窗口中运行。*

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

## 许可证

ISC License

## 相关链接

- [项目仓库](https://github.com/Twiink/TUST-Campusnet-Login)
- [问题反馈](https://github.com/Twiink/TUST-Campusnet-Login/issues)
