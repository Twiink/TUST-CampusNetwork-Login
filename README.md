# TUST-Campusnet-Login (Electron CLI)

一个用于校园网（Portal）自动登录的 **命令行工具**，基于 **Electron 主进程（不创建窗口）**实现。  
目标：在 **Windows / macOS** 上都能使用，支持「连接指定 WiFi → 探测是否掉线/被 Portal 劫持 → 自动登录 → 定时轮询重登」。

> 本仓库当前以 CLI 为主（cmd/Terminal 运行），后续如需托盘或 GUI，可在同一 Electron 体系内扩展。

---

## 功能概览（规划/实现中）

- [x] CLI 基础框架（Electron main-only，不弹窗）
- [ ] 配置管理（账号/密码/登录 URL/SSID/轮询间隔）
- [ ] 网络探测（判断是否需要登录：HTTP 探测/重定向识别）
- [ ] 登录请求（复刻 shell 脚本逻辑：参数编码、请求、响应判定）
- [ ] 定时守护（daemon 模式：掉线重试 + 指数退避）
- [ ] WiFi 管理（Windows: netsh, macOS: networksetup）
- [ ] 开机自启动（Windows 注册表/启动项；macOS LaunchAgent）
- [ ] 安全存储（可选：keytar 存密码）

---

## 环境要求

- Node.js >= 20
- pnpm（推荐）或 npm
- Windows：如使用 keytar 等原生模块，可能需要安装 Build Tools（后续再补）
- macOS：如需打包分发、签名/公证，需要在 Mac 上执行（开发可在 Win 完成）

---

## 快速开始（从零初始化/安装依赖）

### 1) 安装依赖

在仓库根目录：

```bash
pnpm install
