# 更新日志 (CHANGELOG)

所有显著的变更都会记录在此文件。

本项目遵循[语义化版本控制](https://semver.org/lang/zh-CN/) (Semantic Versioning)。

---

## [未发布] - 2026-01-04

### 新增

#### 全面的应用日志系统

**功能描述**：
- 为应用所有核心服务和操作添加详细的日志记录
- 支持多种日志级别（debug、info、success、warn、error）
- 自动管理日志存储（7天保留期，最多500条）
- 结构化日志记录，便于问题排查和性能分析

**日志覆盖范围**：

1. **核心业务服务** (`packages/shared`)
   - `AuthService` - 登录/登出全流程，包含用户账号、运营商、IP地址、服务器URL
   - `NetworkDetector` - 网络连通性检查、认证状态、延迟测量、WiFi状态获取
   - `ConfigManager` - 配置加载/保存/更新，记录账户数量、WiFi配置等详细信息
   - `AccountManager` - 账户增删改查，记录所有账户操作的完整上下文
   - `WifiManager` - WiFi配置管理，记录SSID、优先级、自动连接等信息

2. **桌面服务** (`apps/desktop/electron`)
   - `AutoReconnectService` - 自动重连全流程，包含每次重试的详细信息
   - `HeartbeatService` - 心跳检测状态轮询，网络状态变化监控
   - `IPC Handlers` - 所有IPC请求/响应/错误/事件广播

**日志特性**：
- 结构化数据记录（键值对格式）
- 自动过期清理（默认7天）
- 每小时检查过期日志
- 默认保留最新500条日志
- 支持日志级别筛选（UI界面）

**实现细节**：
- `Logger` 类增加了自动清理功能 (`cleanupExpiredLogs`)
- 每1小时检查一次过期日志 (`LOG_CLEANUP_INTERVAL`)
- 所有服务构造函数接收可选的 `logger` 参数
- 使用 `logger?.method()` 模式避免空指针错误
- 错误日志包含完整的错误堆栈信息

**新增文件**：
无（基于现有日志系统增强）

**修改文件**：
- `packages/shared/src/models/Logger.ts` - 添加自动清理功能
- `packages/shared/src/services/AuthService.ts` - 添加详细登录/登出日志
- `packages/shared/src/services/NetworkDetector.ts` - 添加网络检测全流程日志
- `packages/shared/src/services/ConfigManager.ts` - 添加配置管理操作日志
- `packages/shared/src/services/AccountManager.ts` - 添加账户管理操作日志
- `packages/shared/src/services/WifiManager.ts` - 添加WiFi配置操作日志
- `apps/desktop/electron/services/auto-reconnect.ts` - 添加自动重连详细日志
- `apps/desktop/electron/ipc/network.ts` - 添加心跳检测和IPC操作日志
- `apps/desktop/electron/ipc/auth.ts` - 添加认证IPC操作日志
- `apps/desktop/electron/main.ts` - 更新服务初始化，传递logger实例

**测试结果**：
- ✅ shared包构建成功
- ✅ desktop应用构建成功
- ✅ 无TypeScript错误
- ✅ 所有服务日志集成完成

**用户体验**：
- 日志页面可查看所有操作记录
- 便于排查登录失败、网络异常等问题
- 开发者可通过日志了解应用运行状态
- 自动清理避免日志文件过大

---

#### WiFi 连接速度初始化修复

**问题描述**：
- 从断开状态连接WiFi后，连接速度显示为 0 Mbps
- 需要手动刷新才能显示正确的速度
- 仅在首次连接或重新连接时出现

**根本原因**：
- macOS 上 WiFi 刚连接时，网络接口尚未完全初始化传输速率
- `system_profiler` 命令返回的 `transmit rate` 为 0
- 但 MCS index 已存在，说明连接已建立

**解决方案**：
- 检测到 `transmit rate` 为 0 但 `mcs index` 存在时，等待 800ms 后重试
- 重新执行 `system_profiler` 命令获取最新速率
- 如果重试成功，使用新的速率值
- 保持向后兼容，不影响已正常显示速度的情况

**修改文件**：
- `apps/desktop/electron/services/wifi-adapter.ts:223-272`
  - 在 `getMacOSWifiInfo()` 方法中添加重试逻辑
  - 仅在特定条件下触发（linkSpeed === 0 && mcs index 存在）

**测试结果**：
- ✅ 从断开连接到已连接，速度正确显示
- ✅ 已连接状态刷新，速度不受影响
- ✅ Windows平台不受影响

---

#### WiFi 状态自动检测功能

**功能描述**：
- 应用启动后自动监听系统 WiFi 状态变化
- 当 WiFi 连接/断开/切换时，自动更新界面显示
- 无需依赖心跳检测轮询，降低系统资源消耗

**实现方式**：
- 使用轻量级轮询检测 SSID 变化（默认 3 秒间隔）
- 仅检测 SSID，不获取详细信息（速度快，资源消耗低）
- 检测到变化时才触发完整网络状态更新
- 支持 macOS 和 Windows 双平台

**使用场景**：
- 启动应用时显示"未连接 WiFi"，连接后自动更新显示
- WiFi 断开时立即显示断开状态
- 切换 WiFi 时自动更新当前连接信息

**技术细节**：
- macOS: 使用 `networksetup -getairportnetwork en0` 快速获取 SSID
- Windows: 使用 `netsh wlan show interfaces` 快速获取 SSID
- 通过 IPC 事件 `event:network:statusChanged` 通知渲染进程
- 与心跳检测独立运行，互不干扰

**新增文件**：
- `apps/desktop/electron/services/wifi-event-listener.ts` - WiFi 事件监听服务

**修改文件**：
- `apps/desktop/electron/main.ts` - 集成 WiFi 事件监听器

**测试结果**：
- ✅ Lint 检查通过
- ✅ 项目构建成功

### 修复

#### macOS WiFi 状态检测失效问题

**问题描述**：
- 在新版 macOS 系统上，应用启动后显示"WiFi 未连接"，即使实际已连接 WiFi
- Windows 系统下工作正常，仅影响 macOS 平台

**根本原因**：
- macOS 上的 `airport -I` 命令已被 Apple 废弃
- 该命令只返回废弃警告，不再返回实际的 WiFi 数据
- 备用方案 `networksetup -getairportnetwork` 在部分系统上也无法正常工作

**解决方案**：
- 将 WiFi 检测方法替换为 `system_profiler SPAirPortDataType` 命令
- 这是 Apple 推荐的新方法，在新版 macOS 上稳定可靠
- 保持 `networksetup` 作为备用降级方案
- 完全保留 Windows 实现，不影响跨平台兼容性

**修改文件**：
- `apps/desktop/electron/services/wifi-adapter.ts:157-285`
  - 重写 `getMacOSWifiInfo()` 方法
  - 新增 `getMacOSWifiFallback()` 备用方法
  - 支持解析 SSID、信号强度、连接速度、信道、频段、安全类型等信息
- `apps/desktop/electron/services/wifi-detector.ts:38-91`
  - 重写 `getMacOSWifiSSID()` 方法
  - 新增 `getMacOSWifiSSIDFallback()` 备用方法

**测试结果**：
- ✅ macOS WiFi 连接状态正常显示
- ✅ Windows 平台功能完全不受影响
- ✅ Lint 检查通过
- ✅ 项目构建成功

### 文档更新
- ✅ `docs/desktop-wifi-detection.md` - 更新 macOS WiFi 检测方法说明
- ✅ `CHANGELOG.md` - 本次更新日志

---

## [未发布] - 2026-01-03

### 优化

#### 网络延迟测试策略重构
- 简化延迟测试逻辑，移除复杂的 WiFi 配置感知机制
- 采用简单可靠的 Baidu → Speedtest.cn 降级策略
- 移除了所有方法中的 `requiresAuth` 参数传递，提升代码可维护性
- 更新了技术文档 `docs/desktop-wifi-detection.md`，说明当前实现和未来规划
  - v1.0: 百度 + 测速网双重保障
  - v2.0: 计划支持多服务商和用户自定义测速目标

#### 代码质量提升
- **ESLint 完全通过**：修复所有包的 124 个 ESLint 问题（20 错误 + 104 警告）
  - `shared` 包: 0 错误, 0 警告 ✅
  - `desktop` 包: 0 错误, 0 警告 ✅
  - `mobile` 包: 0 错误, 0 警告 ✅（从 124 个问题降至 0）

#### TypeScript 类型系统优化
- 修复 React 类型版本冲突问题（monorepo 多版本类型定义冲突）
- 升级 desktop 包 React 到 18.3.1 版本
- 配置 `tsconfig.json` paths 强制使用本地类型定义
- 修复 `wifi-adapter.ts` GBK 编码类型断言
- 修复 `useNetwork.ts` 初始状态缺失 `wifiConnected` 属性

### 技术细节

#### ESLint 修复分类
1. **未使用的导入/变量** (17 处)
   - 移除: `mergeConfig`, `Appearance`, `Platform`, `Easing`, `GlassCard`, `NetworkStatus`, `RetryPolicyConfig`, `useColorScheme`, `withSpring` 等
   - 未使用参数添加下划线前缀: `_ssid`, `_password`

2. **React Hooks 警告** (5 处)
   - 为有意省略的依赖项添加 `eslint-disable-next-line react-hooks/exhaustive-deps`

3. **parseInt 缺少 radix** (3 处)
   - 统一使用 `parseInt(text, 10)`

4. **位运算符警告** (6 处)
   - 为颜色插值的必要位运算添加 `eslint-disable-next-line no-bitwise`

5. **React Native 内联样式** (97 处)
   - 为需要动态主题的文件添加文件级禁用注释
   - 说明原因：动态主题必须使用内联样式

#### 代码重构
- 重构 `HomeScreen.tsx` 的 `isDarkMode()` 函数（移除非法 Hook 调用）
- 重构 `getSignalIcon()` 和 `getLinkSpeedStatus()` 接收 `dark` 参数
- 更新 `WifiInfoCard` 组件直接使用 `useTheme()` Hook

### 文档更新
- ✅ `docs/desktop-wifi-detection.md` - 新增"问题 4：网络延迟测试策略"章节
- ✅ `CHANGELOG.md` - 本次更新日志

---

## [v1.0.0-beta] - 2026-01-01

> **状态**: 开发完成，待测试

这是 NetMate 的首个公开测试版本。

### 新增功能

#### 核心功能

- 多账户管理（添加、删除、切换账户）
- 服务商选择（校园网/移动/联通/电信）
- 服务器地址自定义配置
- 多 WiFi 配置管理
- WiFi 认证类型切换（需要/无需认证）
- WiFi 关联账号
- WiFi 优先级配置
- 手动登录/登出
- 自动登录（连接 WiFi 后自动认证）
- 心跳检测开关
- 检测间隔配置（默认 30 秒）
- 断线自动重连
- 重试策略（固定延迟/指数退避）
- 启动时 WiFi 检测
- 连接状态显示
- 无账户状态提示
- 网络信息显示
- 运行日志记录
- 日志级别筛选
- 系统通知
- 通知开关

#### 桌面端 (Windows/macOS)

- 系统托盘（图标状态、右键菜单）
- 开机自启
- 系统通知（登录成功/失败/掉线/重连）
- 后台运行（最小化到托盘）
- 自动更新 (electron-updater)

#### 移动端 (Android)

- WiFi 原生模块
- 后台服务 (Foreground Service)
- 开机自启 (BOOT_COMPLETED)
- 系统通知
- 应用内更新 (APK 下载安装)

### 技术栈

- **桌面端**: Electron + React + TypeScript + Vite
- **移动端**: React Native + TypeScript
- **共享层**: TypeScript (跨平台服务)
- **Android 原生**: Kotlin
- **构建工具**: pnpm + tsup

### 项目结构

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

### 已知问题

- iOS 暂不支持（后续版本考虑）
- Android 8.0+ 需要位置权限才能获取 WiFi SSID

### 待完成项

- [ ] 单元测试
- [ ] 真实网络环境测试
- [ ] 多账户切换测试
- [ ] 多 WiFi 匹配测试
- [ ] 性能测试（长时间运行）
- [ ] 用户文档

---

## 计划版本

### [v1.0.0] - 待定

第一个正式版本。

**计划内容**:

- [ ] 修复测试中发现的 Bug
- [ ] 补充单元测试
- [ ] 性能优化
- [ ] 完善用户文档

### [v1.1.0] - 待定

**计划内容**:

- [ ] iOS 支持（待 Android 稳定后）
- [ ] 跨设备配置同步（可选）
- [ ] 更多 UI 主题

---

## 如何贡献

如果你发现了 Bug 或有功能建议，请通过 [GitHub Issues](https://github.com/Twiink/TUST-Campusnet-Login/issues) 反馈。

---

## 感谢

感谢所有为这个项目提供反馈和建议的用户！

---

_生成日期: 2026-01-01_
