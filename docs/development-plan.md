# 开发计划

本文档描述 NetMate 项目的开发计划，按阶段划分，供审核和后续开发参考。

## 需求确认

| 需求项 | 决定 |
|--------|------|
| 认证服务器地址 | 可配置，提供默认值 |
| 多账户支持 | 支持，可切换账户 |
| 服务商选择 | 支持（校园网/移动/联通/电信） |
| 多 WiFi 支持 | 支持，可配置多个 WiFi，支持优先级切换 |
| WiFi 认证配置 | 每个 WiFi 可独立配置是否需要校园网认证 |
| 启动时 WiFi 检测 | 支持，启动时自动检测当前 WiFi 连接状态并显示 |
| 心跳检测开关 | 支持手动开启/关闭心跳检测功能 |
| iOS 支持 | 暂不开发，等 Win/macOS/Android 稳定后再考虑 |
| UI 设计 | 三端统一风格，使用 lucide-react 图标库 |
| 国际化 | 不需要，仅支持中文 |
| 自动更新 | 支持（桌面端 + Android） |
| 数据同步 | 暂不支持，后续有需要再加 |

---

## 开发阶段概览

| 阶段 | 名称 | 主要目标 |
|------|------|----------|
| Phase 1 | 核心业务层 | 实现共享包的核心服务 |
| Phase 2 | 桌面端基础 | Electron 应用基础功能 |
| Phase 3 | 移动端基础 | React Native 应用基础功能 |
| Phase 4 | 平台特性 | 各平台特有功能实现 |
| Phase 5 | 优化与发布 | 测试、优化、打包发布 |

---

## Phase 1: 核心业务层

> 目标：实现 `packages/shared` 中的核心业务逻辑，确保跨平台可用。

### 1.1 项目基础设施

- [ ] 配置 shared 包的 TypeScript 严格模式
- [ ] 配置 tsup 构建输出（ESM + CJS）
- [ ] 添加单元测试框架（Vitest）
- [ ] 配置路径别名和模块导出

### 1.2 类型定义 (`src/types/`)

- [ ] `auth.ts` - 认证相关类型
  - `LoginConfig` 登录配置
  - `LoginResult` 登录结果
  - `LoginParams` 登录参数
- [ ] `config.ts` - 配置相关类型
  - `AccountConfig` 账户配置（支持多账户数组）
  - `WifiConfig` WiFi 配置（支持多 WiFi 数组）
  - `AppSettings` 应用设置
  - `AppConfig` 完整配置
- [ ] `network.ts` - 网络相关类型
  - `NetworkStatus` 网络状态
  - `WifiInfo` WiFi 信息
- [ ] `log.ts` - 日志相关类型
  - `LogLevel` 日志级别
  - `LogEntry` 日志条目

### 1.3 工具函数 (`src/utils/`)

- [ ] `urlEncode.ts` - URL 编码工具
  - `urlencode()` 函数，处理 IPv6 等特殊字符
- [ ] `httpClient.ts` - HTTP 客户端封装
  - 统一的请求/响应处理
  - 超时配置
  - 错误处理
- [ ] `validator.ts` - 数据验证
  - `validateAccountConfig()` 验证账户配置
  - `validateWifiConfig()` 验证 WiFi 配置

### 1.4 核心服务 (`src/services/`)

- [ ] `AuthService.ts` - 登录认证服务
  - `login(config)` 执行登录请求
  - `logout()` 执行登出
  - `buildLoginUrl(params)` 构建登录 URL
  - `parseLoginResponse(response)` 解析登录响应
- [ ] `NetworkDetector.ts` - 联网探测服务
  - `checkConnectivity()` 检查网络连通性
  - `isAuthenticated()` 检查认证状态
  - `startPolling(interval, callback)` 开始轮询
  - `stopPolling()` 停止轮询
- [ ] `RetryPolicy.ts` - 重试策略
  - `execute(operation, options)` 带重试执行
  - 支持固定延迟和指数退避
- [ ] `ConfigManager.ts` - 配置管理（抽象层）
  - `get(key)` / `set(key, value)` 配置读写
  - `validate(config)` 配置验证
  - 定义 `StorageAdapter` 接口供平台实现
- [ ] `AccountManager.ts` - 账户管理服务
  - `addAccount()` 添加账户
  - `removeAccount()` 删除账户
  - `switchAccount()` 切换当前账户
  - `getCurrentAccount()` 获取当前账户
  - `listAccounts()` 获取账户列表
- [ ] `WifiManager.ts` - WiFi 配置管理服务
  - `addWifi()` 添加 WiFi 配置
  - `removeWifi()` 删除 WiFi 配置
  - `listWifiConfigs()` 获取 WiFi 配置列表
  - `matchWifi(ssid)` 匹配当前 WiFi 是否在配置列表中

### 1.5 日志模型 (`src/models/`)

- [ ] `Logger.ts` - 日志服务
  - `info()` / `warn()` / `error()` 日志方法
  - `getLogs(options)` 获取日志列表
  - `clearLogs()` 清除日志
  - 内存存储 + 可选持久化接口

### 1.6 常量定义 (`src/constants/`)

- [ ] `defaults.ts` - 默认配置值
  - 默认服务器地址：`http://10.10.102.50:801`
  - 默认轮询间隔：30 秒
  - 默认重试次数：3 次
- [ ] `errors.ts` - 错误码定义

### 1.7 单元测试

- [ ] AuthService 测试
- [ ] NetworkDetector 测试
- [ ] RetryPolicy 测试
- [ ] AccountManager 测试
- [ ] WifiManager 测试
- [ ] 工具函数测试

---

## Phase 2: 桌面端基础

> 目标：实现 Electron 桌面应用的基础功能。
>
> **注意**：UI 组件由外部提供，本阶段只实现业务逻辑和数据层。

### 2.1 Electron 主进程 (`electron/`)

- [ ] 重构 `main.ts` 主进程入口
  - 窗口管理
  - 生命周期处理
- [ ] 实现 `preload.ts` 预加载脚本
  - 暴露安全的 API 给渲染进程
- [ ] IPC 通信模块 (`ipc/`)
  - [ ] `auth.ts` - 认证相关 IPC 处理
  - [ ] `config.ts` - 配置相关 IPC 处理
  - [ ] `account.ts` - 账户管理 IPC 处理
  - [ ] `wifi.ts` - WiFi 配置 IPC 处理
  - [ ] `network.ts` - 网络相关 IPC 处理

### 2.2 平台服务 (`electron/services/`)

- [ ] `store.ts` - 本地存储
  - 使用 `electron-store` 实现 `StorageAdapter`
  - 敏感数据加密存储（使用 `safeStorage`）
- [ ] `network.ts` - 网络工具
  - 获取本机 IPv4 地址
  - 获取本机 IPv6 地址
  - 获取 MAC 地址

### 2.3 渲染进程逻辑层 (`src/`)

- [ ] 状态管理 (`stores/`)
  - Zustand store 设置
  - 配置状态（含多账户、多 WiFi）
  - 网络状态
  - 日志状态
- [ ] Hooks (`hooks/`)
  - [ ] `useAccounts.ts` - 多账户管理
  - [ ] `useWifiConfigs.ts` - 多 WiFi 配置管理
  - [ ] `useConfig.ts` - 应用配置管理
  - [ ] `useNetwork.ts` - 网络状态
  - [ ] `useAuth.ts` - 认证操作
- [ ] 类型定义 (`types/`)
  - [ ] `electron.d.ts` - Electron API 类型声明

### 2.4 核心流程实现

- [ ] 启动时 WiFi 状态检测（检测是否连接 WiFi 并显示 SSID）
- [ ] 手动登录流程
- [ ] 多账户管理（添加/删除/切换）
- [ ] 多 WiFi 配置管理
- [ ] 配置保存/读取
- [ ] 网络状态检测
- [ ] 日志记录

---

## Phase 3: 移动端基础

> 目标：实现 React Native Android 应用的基础功能。
>
> **注意**：UI 组件由外部提供，本阶段只实现业务逻辑和平台适配。

### 3.1 项目配置

- [ ] 配置 Metro 支持 Monorepo（读取 shared 包）
- [ ] 配置 Android 权限
  - `ACCESS_WIFI_STATE`
  - `CHANGE_WIFI_STATE`
  - `ACCESS_NETWORK_STATE`
  - `ACCESS_FINE_LOCATION`（WiFi 扫描需要）
  - `RECEIVE_BOOT_COMPLETED`
  - `FOREGROUND_SERVICE`
  - `FOREGROUND_SERVICE_DATA_SYNC`

### 3.2 原生模块 (`android/modules/`)

- [ ] `WifiModule.kt` - WiFi 控制模块
  - 获取当前 WiFi 信息（SSID）
  - 连接指定 WiFi
  - 获取 IP 地址（IPv4/IPv6）
  - 获取 MAC 地址
- [ ] `NetworkModule.kt` - 网络信息模块
  - 网络状态监听
- [ ] 导出原生模块给 JS 层

### 3.3 平台服务 (`src/services/`)

- [ ] `storage.ts` - 存储服务
  - 使用 `@react-native-async-storage/async-storage`
  - 实现 `StorageAdapter` 接口
  - 敏感数据使用 `react-native-keychain` 加密
- [ ] `wifi.ts` - WiFi 服务
  - 封装原生 WiFi 模块
- [ ] `notification.ts` - 通知服务
  - 使用 `@notifee/react-native`

### 3.4 逻辑层实现

- [ ] 状态管理（复用桌面端模式）
- [ ] Hooks（适配移动端）
  - [ ] `useAccounts.ts`
  - [ ] `useWifiConfigs.ts`
  - [ ] `useConfig.ts`
  - [ ] `useNetwork.ts`
  - [ ] `useAuth.ts`

### 3.5 核心流程实现

- [ ] 启动时 WiFi 状态检测（检测是否连接 WiFi 并显示 SSID）
- [ ] 手动登录流程
- [ ] 多账户管理
- [ ] 多 WiFi 配置管理
- [ ] 配置保存/读取
- [ ] WiFi 状态检测
- [ ] 日志记录

---

## Phase 4: 平台特性

> 目标：实现各平台特有的高级功能。

### 4.1 桌面端特性

- [ ] **系统托盘** (`electron/services/tray.ts`)
  - 托盘图标
  - 右键菜单（显示窗口、登录/登出、切换账户、退出）
  - 状态图标变化（已连接/未连接/连接中）
- [ ] **开机自启** (`electron/services/autoLaunch.ts`)
  - 使用 `auto-launch` 库
  - 设置界面开关
- [ ] **系统通知** (`electron/services/notification.ts`)
  - 登录成功/失败通知
  - 掉线通知
  - 账户切换通知
- [ ] **后台运行**
  - 关闭窗口时最小化到托盘
  - 后台轮询检测
- [ ] **自动重连**
  - 检测到掉线自动重新登录
  - 重试策略集成
- [ ] **自动更新** (`electron/services/updater.ts`)
  - 使用 `electron-updater`
  - 检查更新
  - 下载并安装更新
  - 更新通知

### 4.2 移动端特性

- [ ] **后台服务** (`src/services/background.ts`)
  - Android Foreground Service
  - 保持后台运行
  - 常驻通知显示状态
- [ ] **开机自启** (`android/modules/AutoStartModule.kt`)
  - 注册 `BOOT_COMPLETED` 广播
  - 开机启动后台服务
- [ ] **WiFi 自动连接**
  - 监听 WiFi 状态变化
  - 根据配置列表自动连接匹配的 WiFi
- [ ] **自动登录**
  - WiFi 连接后自动触发登录
  - 使用当前选中的账户
- [ ] **通知**
  - 后台服务常驻通知
  - 状态变化通知
  - 账户切换通知
- [ ] **应用内更新** (`src/services/updater.ts`)
  - 检查 GitHub Releases 最新版本
  - 下载 APK
  - 触发安装

### 4.3 共享功能完善

- [ ] 轮询检测机制
  - 可配置间隔
  - 状态回调
- [ ] 掉线自动重连
  - 集成 RetryPolicy
  - 重连次数限制
  - 重连间隔策略
- [ ] 日志持久化
  - 最近 N 条日志保存（默认 500 条）
  - 支持导出为文本

---

## Phase 5: 优化与发布

> 目标：测试、优化、打包发布。

### 5.1 测试

- [ ] 核心业务层单元测试
- [ ] 桌面端集成测试
- [ ] 移动端集成测试
- [ ] 真实网络环境测试
- [ ] 多账户切换测试
- [ ] 多 WiFi 匹配测试

### 5.2 优化

- [ ] 性能优化
  - 减少不必要的渲染
  - 优化轮询机制
- [ ] 体验优化
  - 加载状态
  - 错误提示
  - 操作反馈
- [ ] 代码优化
  - 代码审查
  - 移除未使用代码

### 5.3 桌面端打包

- [ ] 配置 `electron-builder`
- [ ] Windows 打包 (NSIS 安装包)
- [ ] macOS 打包 (DMG)
- [ ] 配置自动更新（GitHub Releases）
- [ ] 应用签名（可选）

### 5.4 移动端打包

- [ ] 配置 Gradle 打包
- [ ] 生成签名 APK
- [ ] 上传到 GitHub Releases

### 5.5 文档完善

- [ ] 用户使用手册
- [ ] 常见问题 FAQ
- [ ] 更新日志 CHANGELOG

---

## 配置模型设计

根据需求确认，配置模型需要支持多账户和多 WiFi：

```typescript
// 完整的应用配置
interface AppConfig {
  // 账户配置（支持多账户）
  accounts: AccountConfig[];
  currentAccountId: string | null;  // 当前使用的账户 ID

  // WiFi 配置（支持多个）
  wifiList: WifiConfig[];

  // 应用设置
  settings: AppSettings;
}

interface AccountConfig {
  id: string;               // 账户唯一标识
  name: string;             // 账户名称（显示用）
  username: string;         // 校园网账号
  password: string;         // 校园网密码（加密存储）
  serverUrl: string;        // 认证服务器地址（可自定义，有默认值）
  isp: 'campus' | 'cmcc' | 'cucc' | 'ctcc'; // 服务商选择
}

interface WifiConfig {
  id: string;               // WiFi 配置唯一标识
  ssid: string;             // WiFi 名称
  password: string;         // WiFi 密码（加密存储）
  autoConnect: boolean;     // 是否自动连接
  requiresAuth: boolean;    // 是否需要校园网认证登录
  linkedAccountId?: string; // 关联的账号ID（仅当 requiresAuth 为 true 时使用）
  priority: number;         // 优先级（数字越小优先级越高）
}

interface AppSettings {
  autoLaunch: boolean;      // 开机自启
  enableHeartbeat: boolean; // 是否启用心跳检测（用户可手动开关）
  pollingInterval: number;  // 轮询间隔（秒），默认 30
  autoReconnect: boolean;   // 自动重连
  maxRetries: number;       // 最大重试次数，默认 3
  showNotification: boolean; // 显示通知
  autoUpdate: boolean;      // 自动检查更新
}
```

### WiFi 配置说明

- **requiresAuth**: 标识此 WiFi 是否需要校园网认证
  - `true`: 校园网 WiFi，连接后需要向认证服务器发送登录请求
  - `false`: 家庭 WiFi / 热点，无需校园网认证
- **linkedAccountId**: 关联的账号ID，WiFi 使用该账号的服务器地址和服务商信息进行认证
  - 仅当 `requiresAuth` 为 `true` 时需要配置
  - 账号删除时，关联的 WiFi 配置会自动解除关联
- **priority**: WiFi 优先级，当心跳检测发现断线且重连失败时，会按优先级顺序尝试切换到其他 WiFi

### 心跳检测流程

1. 用户在设置中开启「心跳检测」开关（enableHeartbeat = true）
2. 系统按 pollingInterval 间隔轮询检测网络连通性
3. 若检测到断线：
   - 首先尝试重新登录当前网络（最多 maxRetries 次）
   - 若仍失败，按 WiFi 优先级切换到其他配置的校园网 WiFi
   - 若目标 WiFi 的 requiresAuth 为 true，则发送登录请求
   - 若目标 WiFi 的 requiresAuth 为 false，则仅连接 WiFi 无需登录

---

## 技术选型

### 共享包

| 需求 | 方案 |
|------|------|
| 构建工具 | tsup |
| 测试框架 | Vitest |
| HTTP 客户端 | 原生 fetch |
| UUID 生成 | nanoid |

### 桌面端

| 需求 | 方案 |
|------|------|
| 状态管理 | Zustand |
| 路由 | React Router |
| 本地存储 | electron-store |
| 加密存储 | Electron safeStorage |
| 开机自启 | auto-launch |
| 自动更新 | electron-updater |

### 移动端

| 需求 | 方案 |
|------|------|
| 状态管理 | Zustand |
| 导航 | React Navigation |
| 本地存储 | @react-native-async-storage/async-storage |
| 加密存储 | react-native-keychain |
| WiFi 控制 | 自定义原生模块 |
| 通知 | @notifee/react-native |
| 后台服务 | react-native-background-actions |

---

## 开发优先级

**建议开发顺序：**

1. **Phase 1 (核心业务层)** - 必须首先完成，是其他阶段的基础
2. **Phase 2 (桌面端基础)** - 桌面端开发调试更方便，先完成基础功能
3. **Phase 4.1 (桌面端特性)** - 完善桌面端，形成可用版本
4. **Phase 3 (移动端基础)** - 复用 shared 包，实现移动端
5. **Phase 4.2 (移动端特性)** - 完善移动端特性
6. **Phase 5 (优化发布)** - 最终测试和发布

---

## 里程碑

| 里程碑 | 完成标准 |
|--------|----------|
| M1 - 核心可用 | shared 包完成，单元测试通过 |
| M2 - 桌面端可用 | 桌面端可手动登录，启动时显示 WiFi 状态，多账户/多WiFi配置可保存 |
| M3 - 桌面端完整 | 托盘、自启、自动重连、自动更新功能完成 |
| M4 - 移动端可用 | Android 可手动登录，启动时显示 WiFi 状态，多账户/多WiFi配置可保存 |
| M5 - 移动端完整 | 后台服务、自动连接、应用内更新功能完成 |
| M6 - 发布就绪 | 测试通过，打包完成，发布到 GitHub Releases |

---

## 自动更新方案

### 桌面端 (electron-updater)

```
发布流程：
1. 更新 package.json 版本号
2. 构建应用（pnpm build:desktop）
3. 打包（electron-builder）
4. 上传到 GitHub Releases

更新流程：
1. 应用启动时检查 GitHub Releases
2. 发现新版本弹出通知
3. 后台下载更新包
4. 下载完成提示重启安装
```

### 移动端 (应用内更新)

```
发布流程：
1. 更新 package.json 版本号
2. 构建签名 APK
3. 上传到 GitHub Releases

更新流程：
1. 应用启动时检查 GitHub Releases API
2. 比较版本号，发现新版本弹出对话框
3. 用户确认后下载 APK 到本地
4. 调用系统安装器安装
```

---

## 备注

- iOS 支持暂不开发，待 Windows、macOS、Android 三端稳定后再考虑
- UI 组件由外部提供，开发时使用临时 UI 验证逻辑即可
- 所有敏感数据（密码）必须加密存储
