# 项目架构设计

本文档详细描述 NetMate 项目的目录结构和架构设计。

## 整体架构

采用 pnpm Monorepo 架构，实现代码共享和统一管理：

```
+------------------------------------------------------------------------+
|                             Monorepo Root                              |
+------------------------------------------------------------------------+
|                                                                        |
|  +------------------------------------------------------------------+  |
|  |                         apps/ (Application Layer)                |  |
|  |  +--------------------+    +----------------------------+        |  |
|  |  |      desktop/      |    |           mobile/          |        |  |
|  |  |   Electron App     |    |      React Native App      |        |  |
|  |  |   (Win + macOS)    |    |         (Android)          |        |  |
|  |  +--------------------+    +----------------------------+        |  |
|  +------------------------------------------------------------------+  |
|                                   |                                    |
|                                   v                                    |
|  +------------------------------------------------------------------+  |
|  |                       packages/ (Shared Layer)                   |  |
|  |  +---------------------------------------------------------+     |  |
|  |  |                       shared/                           |     |  |
|  |  |              Core Business Logic (Cross-platform)       |     |  |
|  |  +---------------------------------------------------------+     |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
+------------------------------------------------------------------------+
```

## 详细目录结构

```
NetMate/
+-- .github/                          # GitHub config
|   +-- workflows/                    # CI/CD workflows
|       +-- desktop-build.yml         # Desktop build
|       +-- mobile-build.yml          # Mobile build
|
+-- apps/                             # Application directory
|   |
|   +-- desktop/                      # Electron desktop app
|   |   +-- electron/                 # Electron main process
|   |   |   +-- main.ts               # Main process entry
|   |   |   +-- preload.ts            # Preload script
|   |   |   +-- ipc/                  # IPC communication module
|   |   |   |   +-- index.ts          # IPC handler registration
|   |   |   |   +-- auth.ts           # Auth-related IPC
|   |   |   |   +-- config.ts         # Config-related IPC
|   |   |   |   +-- network.ts        # Network-related IPC
|   |   |   +-- services/             # Platform services
|   |   |   |   +-- tray.ts           # System tray
|   |   |   |   +-- autoLaunch.ts     # Auto launch
|   |   |   |   +-- notification.ts   # System notifications
|   |   |   |   +-- store.ts          # Local storage
|   |   |   +-- utils/                # Utility functions
|   |   |       +-- network.ts        # Network utils (get IP/MAC)
|   |   +-- src/                      # Renderer process (React)
|   |   |   +-- main.tsx              # Entry file
|   |   |   +-- App.tsx               # Root component
|   |   |   +-- components/           # UI components
|   |   |   |   +-- common/           # Common components
|   |   |   |   |   +-- Button.tsx
|   |   |   |   |   +-- Input.tsx
|   |   |   |   |   +-- Switch.tsx
|   |   |   |   +-- AccountForm.tsx   # Account config form
|   |   |   |   +-- WifiForm.tsx      # WiFi config form
|   |   |   |   +-- SettingsForm.tsx  # Settings form
|   |   |   |   +-- StatusPanel.tsx   # Status panel
|   |   |   |   +-- LogViewer.tsx     # Log viewer
|   |   |   +-- pages/                # Pages
|   |   |   |   +-- Home.tsx          # Home (status overview)
|   |   |   |   +-- Settings.tsx      # Settings page
|   |   |   |   +-- Logs.tsx          # Logs page
|   |   |   +-- hooks/                # React Hooks
|   |   |   |   +-- useConfig.ts      # Config Hook
|   |   |   |   +-- useNetwork.ts     # Network status Hook
|   |   |   |   +-- useAuth.ts        # Auth Hook
|   |   |   +-- stores/               # State management
|   |   |   |   +-- index.ts          # Zustand Store
|   |   |   +-- styles/               # Style files
|   |   |   |   +-- index.css         # Global styles
|   |   |   |   +-- variables.css     # CSS variables
|   |   |   +-- types/                # Type definitions
|   |   |       +-- electron.d.ts     # Electron API types
|   |   +-- public/                   # Static assets
|   |   |   +-- icons/                # App icons
|   |   +-- resources/                # Build resources
|   |   |   +-- icon.ico              # Windows icon
|   |   |   +-- icon.icns             # macOS icon
|   |   +-- electron-builder.json5    # Build config
|   |   +-- vite.config.ts            # Vite config
|   |   +-- tsconfig.json             # TypeScript config
|   |   +-- package.json
|   |
|   +-- mobile/                       # React Native mobile app
|       +-- android/                  # Android native code
|       |   +-- app/
|       |   |   +-- src/main/java/    # Java/Kotlin code
|       |   |       +-- modules/      # Native modules
|       |   |           +-- WifiModule.kt      # WiFi control
|       |   |           +-- AutoStartModule.kt # Auto start
|       |   +-- build.gradle
|       +-- ios/                      # iOS native code (reserved)
|       +-- src/                      # React Native code
|       |   +-- App.tsx               # Root component
|       |   +-- components/           # UI components
|       |   |   +-- common/           # Common components
|       |   |   +-- AccountForm.tsx
|       |   |   +-- WifiForm.tsx
|       |   |   +-- SettingsForm.tsx
|       |   |   +-- StatusPanel.tsx
|       |   +-- screens/              # Screens
|       |   |   +-- HomeScreen.tsx
|       |   |   +-- SettingsScreen.tsx
|       |   |   +-- LogsScreen.tsx
|       |   +-- navigation/           # Navigation config
|       |   |   +-- index.tsx
|       |   +-- hooks/                # React Hooks
|       |   +-- services/             # Platform services
|       |   |   +-- wifi.ts           # WiFi control
|       |   |   +-- notification.ts   # Notifications
|       |   |   +-- background.ts     # Background service
|       |   |   +-- storage.ts        # Storage
|       |   +-- stores/               # State management
|       |   +-- types/                # Type definitions
|       +-- index.js                  # Entry file
|       +-- metro.config.js           # Metro config
|       +-- babel.config.js           # Babel config
|       +-- package.json
|
+-- packages/                         # Shared packages directory
|   |
|   +-- shared/                       # Core business package
|       +-- src/
|       |   +-- index.ts              # Export entry
|       |   |
|       |   +-- services/             # Core services
|       |   |   +-- index.ts          # Service exports
|       |   |   +-- AuthService.ts    # Login auth service
|       |   |   |   - login()         # Execute login
|       |   |   |   - logout()        # Execute logout
|       |   |   |   - buildLoginUrl() # Build login URL
|       |   |   |
|       |   |   +-- NetworkDetector.ts # Network detection service
|       |   |   |   - checkConnectivity()   # Check network connectivity
|       |   |   |   - isAuthenticated()     # Check if authenticated
|       |   |   |   - startPolling()        # Start polling detection
|       |   |   |   - stopPolling()         # Stop polling detection
|       |   |   |
|       |   |   +-- RetryPolicy.ts    # Retry policy
|       |   |   |   - execute()       # Execute with retry
|       |   |   |   - setMaxRetries() # Set max retries
|       |   |   |   - setDelay()      # Set retry delay
|       |   |   |
|       |   |   +-- ConfigManager.ts  # Config management
|       |   |       - get()           # Get config
|       |   |       - set()           # Set config
|       |   |       - validate()      # Validate config
|       |   |
|       |   +-- utils/                # Utility functions
|       |   |   +-- index.ts          # Utils exports
|       |   |   +-- urlEncode.ts      # URL encoding
|       |   |   +-- httpClient.ts     # HTTP client wrapper
|       |   |   +-- validator.ts      # Data validation
|       |   |
|       |   +-- models/               # Data models
|       |   |   +-- index.ts          # Model exports
|       |   |   +-- Logger.ts         # Logger model
|       |   |   |   - info()          # Info log
|       |   |   |   - warn()          # Warning log
|       |   |   |   - error()         # Error log
|       |   |   |   - getLogs()       # Get log list
|       |   |   |
|       |   |   +-- Config.ts         # Config model
|       |   |       - AccountConfig   # Account config
|       |   |       - WifiConfig      # WiFi config
|       |   |       - AppConfig       # App config
|       |   |
|       |   +-- types/                # Type definitions
|       |   |   +-- index.ts          # Type exports
|       |   |   +-- auth.ts           # Auth-related types
|       |   |   +-- config.ts         # Config-related types
|       |   |   +-- network.ts        # Network-related types
|       |   |   +-- log.ts            # Log-related types
|       |   |
|       |   +-- constants/            # Constants
|       |       +-- index.ts          # Constants exports
|       |       +-- defaults.ts       # Default values
|       |       +-- errors.ts         # Error codes
|       |
|       +-- tsup.config.ts            # Build config
|       +-- tsconfig.json             # TypeScript config
|       +-- package.json
|
+-- docs/                             # Project docs
|   +-- architecture.md               # Architecture design (this doc)
|   +-- api.md                        # API docs
|   +-- development.md                # Development guide
|
+-- shell/                            # Reference scripts
|   +-- base.sh                       # Login script reference
|
+-- .github/                          # GitHub config
+-- .eslintrc.cjs                     # ESLint config
+-- .prettierrc.cjs                   # Prettier config
+-- .gitignore                        # Git ignore config
+-- package.json                      # Root package.json
+-- pnpm-workspace.yaml               # pnpm workspace config
+-- pnpm-lock.yaml                    # Dependency lock file
+-- README.md                         # Project readme
```

## 模块设计

### 1. 核心业务层 (packages/shared)

#### 1.1 AuthService - 登录认证服务

负责校园网认证登录的核心逻辑。

```typescript
interface AuthService {
  // 执行登录
  login(config: LoginConfig): Promise<LoginResult>;

  // 执行登出
  logout(): Promise<void>;

  // 构建登录请求 URL
  buildLoginUrl(params: LoginParams): string;
}

interface LoginConfig {
  serverUrl: string; // 认证服务器地址
  userAccount: string; // 用户账号
  userPassword: string; // 用户密码
  wlanUserIp: string; // IPv4 地址
  wlanUserIpv6?: string; // IPv6 地址
  wlanUserMac?: string; // MAC 地址
}

interface LoginResult {
  success: boolean;
  message: string;
  code?: number;
}
```

#### 1.2 NetworkDetector - 联网探测服务

负责网络状态检测和轮询，包括启动时的 WiFi 连接状态检测。

**重要原则**：WiFi 连接状态检测应独立于账户配置，优先显示实际 WiFi 连接信息。

```typescript
interface NetworkDetector {
  // 检查网络连通性
  checkConnectivity(): Promise<boolean>;

  // 检查是否已通过校园网认证
  isAuthenticated(): Promise<boolean>;

  // 获取当前 WiFi 状态（启动时调用，无论是否配置账户）
  getCurrentWifiStatus(): Promise<NetworkStatus>;

  // 获取 WiFi 信号强度（0-100）
  getSignalStrength(): Promise<number>;

  // 测试网络延迟（Ping）
  // 优先测试认证服务器，失败则测试公共 DNS（8.8.8.8）
  // 每 5 秒自动刷新一次
  measureLatency(target?: string): Promise<LatencyResult>;

  // 获取完整的 WiFi 详细信息
  getWifiDetails(): Promise<WifiDetails>;

  // 开始轮询检测
  startPolling(interval: number, callback: NetworkCallback): void;

  // 停止轮询检测
  stopPolling(): void;
}

type NetworkCallback = (status: NetworkStatus) => void;

interface NetworkStatus {
  connected: boolean; // 网络是否连接
  authenticated: boolean; // 是否已认证（需要认证的 WiFi）
  wifiConnected: boolean; // WiFi 是否连接（最高优先级）
  ssid?: string; // 当前 WiFi SSID（若已连接，必须显示）
  signalStrength?: number; // 信号强度（0-100）
  linkSpeed?: number; // 连接速度（Mbps）
  frequency?: number; // 频段（MHz：2400 或 5000）
  latency?: LatencyResult; // 延迟信息
  ip?: string; // 当前 IPv4 地址
  ipv6?: string; // 当前 IPv6 地址
  mac?: string; // MAC 地址
  gateway?: string; // 网关地址
  dns?: string; // DNS 服务器地址
  subnetMask?: string; // 子网掩码
  bssid?: string; // 路由器 MAC 地址
  channel?: number; // WiFi 信道
  security?: string; // 安全类型（如 WPA2-PSK、WPA3）
  isConfigured?: boolean; // 该 WiFi 是否在配置列表中
  requiresAuth?: boolean; // 该 WiFi 是否需要认证
  hasLinkedAccount?: boolean; // 是否已关联账户
}

interface LatencyResult {
  value: number; // 延迟值（毫秒）
  status: 'excellent' | 'good' | 'fair' | 'poor' | 'very-poor' | 'timeout'; // 延迟等级
  target: string; // 测试目标地址
  timestamp: number; // 测试时间戳
}

interface WifiDetails {
  ssid: string; // WiFi 名称
  bssid?: string; // 路由器 MAC 地址
  signalStrength: number; // 信号强度（0-100）
  linkSpeed: number; // 连接速度（Mbps）
  frequency: number; // 频段（2400 或 5000 MHz）
  channel?: number; // 信道
  security?: string; // 安全类型
  ipv4?: string; // IPv4 地址
  ipv6?: string; // IPv6 地址
  mac?: string; // 本机 MAC 地址
  gateway?: string; // 网关地址
  dns?: string[]; // DNS 服务器列表
  subnetMask?: string; // 子网掩码
  connected: boolean; // 是否已连接
  latency?: LatencyResult; // 延迟信息
}
```

#### 1.3 RetryPolicy - 重试策略

提供通用的重试机制。

```typescript
interface RetryPolicy {
  // 执行带重试的异步操作
  execute<T>(operation: () => Promise<T>, options?: RetryOptions): Promise<T>;
}

interface RetryOptions {
  maxRetries: number; // 最大重试次数
  delay: number; // 重试延迟（毫秒）
  backoff?: 'fixed' | 'exponential'; // 延迟策略
  onRetry?: (attempt: number, error: Error) => void;
}
```

#### 1.4 Logger - 日志模型

统一的日志记录和管理。

```typescript
interface Logger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: Error): void;

  getLogs(options?: LogQueryOptions): LogEntry[];
  clearLogs(): void;
}

interface LogEntry {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  data?: unknown;
}
```

### 2. 平台适配层

各平台需要实现的适配接口：

#### 2.1 存储适配 (StorageAdapter)

```typescript
interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Desktop: electron-store
// Mobile: @react-native-async-storage/async-storage
```

#### 2.2 WiFi 控制 (WifiAdapter)

负责 WiFi 相关操作，包括启动时获取当前 WiFi 连接状态。

```typescript
interface WifiAdapter {
  // 获取当前连接的 WiFi 信息（启动时调用，检测是否已连接 WiFi）
  getCurrentWifi(): Promise<WifiInfo | null>;

  // 获取完整的 WiFi 详细信息（包括网络配置）
  getWifiDetails(): Promise<WifiDetails | null>;

  // 获取 WiFi 信号强度（0-100）
  getSignalStrength(): Promise<number>;

  // 获取 WiFi 连接速度（Mbps）
  getLinkSpeed(): Promise<number>;

  // 获取 WiFi 频段（MHz：2400 或 5000）
  getFrequency(): Promise<number>;

  // 获取 WiFi 信道
  getChannel(): Promise<number | null>;

  // 获取 BSSID（路由器 MAC 地址）
  getBSSID(): Promise<string | null>;

  // 获取安全类型
  getSecurity(): Promise<string | null>;

  // 获取网络配置信息
  getNetworkInfo(): Promise<NetworkInfo>;

  // 连接到指定 WiFi
  connect(ssid: string, password: string): Promise<boolean>;

  // 断开 WiFi
  disconnect(): Promise<void>;

  // 获取可用 WiFi 列表
  scan(): Promise<WifiInfo[]>;
}

interface WifiInfo {
  ssid: string; // WiFi 名称
  bssid?: string; // 路由器 MAC 地址
  signalStrength: number; // 信号强度 (0-100)
  linkSpeed?: number; // 连接速度 (Mbps)
  frequency?: number; // 频段 (2400/5000 MHz)
  channel?: number; // 信道
  security?: string; // 安全类型（如 WPA2-PSK）
  connected: boolean; // 是否已连接
}

interface WifiDetails extends WifiInfo {
  ipv4?: string; // IPv4 地址
  ipv6?: string; // IPv6 地址
  mac?: string; // 本机 MAC 地址
  gateway?: string; // 网关地址
  dns?: string[]; // DNS 服务器列表
  subnetMask?: string; // 子网掩码
  latency?: number; // 延迟（毫秒）
}

interface NetworkInfo {
  ipv4?: string; // IPv4 地址
  ipv6?: string; // IPv6 地址
  mac?: string; // MAC 地址
  gateway?: string; // 网关地址
  dns?: string[]; // DNS 服务器列表
  subnetMask?: string; // 子网掩码
}

// Desktop: 使用系统命令
//   - Windows: netsh wlan show interfaces, ipconfig /all
//   - macOS: networksetup -getinfo Wi-Fi, airport -I
// Mobile:
//   - Android: WifiManager, NetworkInterface
//   - react-native-wifi-reborn (基础功能)
```

#### 2.3 系统自启 (AutoLaunchAdapter)

```typescript
interface AutoLaunchAdapter {
  enable(): Promise<void>;
  disable(): Promise<void>;
  isEnabled(): Promise<boolean>;
}

// Desktop: auto-launch 库
// Mobile: Android - 注册 BOOT_COMPLETED 广播
```

#### 2.4 通知 (NotificationAdapter)

```typescript
interface NotificationAdapter {
  show(options: NotificationOptions): Promise<void>;
}

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
}

// Desktop: Electron Notification API
// Mobile: react-native-push-notification
```

### 3. 数据流

```
User Action
    |
    v
+-------------------------------------------------------------+
|                        UI Layer                             |
|  (React / React Native Components)                          |
+-------------------------------------------------------------+
    |
    v  Call Hooks / Store Actions
+-------------------------------------------------------------+
|                    State Management Layer                   |
|  (Zustand Store)                                            |
+-------------------------------------------------------------+
    |
    v  Call Platform Adapters / Shared Services
+-------------------------------------------------------------+
|                      Service Layer                          |
|  +-----------------+    +----------------------------+      |
|  |  Platform       |    |      Shared Services       |      |
|  |  Adapters       |    |  (packages/shared)         |      |
|  +-----------------+    +----------------------------+      |
+-------------------------------------------------------------+
    |
    v
+-------------------------------------------------------------+
|                    System/Network Layer                     |
|  (OS APIs / HTTP Requests)                                  |
+-------------------------------------------------------------+
```

### 4. 运行状态页面显示逻辑

运行状态页面（Home/HomeScreen）需要按照以下优先级顺序显示信息，确保用户始终能看到最重要的网络状态。

#### 4.1 显示优先级顺序

```
启动应用
    |
    v
+------------------------------------------------------------------+
| 第一优先级：检测 WiFi 连接状态（无条件执行）                      |
| - 调用 WifiAdapter.getCurrentWifi()                              |
| - 调用 NetworkDetector.getSignalStrength()                       |
| - 调用 NetworkDetector.measureLatency()                          |
+------------------------------------------------------------------+
    |
    v
+-----------------+      未连接
| 是否连接 WiFi？  |------------------------> [显示：未连接 WiFi]
+-----------------+
    | 已连接
    v
+------------------------------------------------------------------+
| 显示：WiFi 基础信息（必须显示）                                   |
| - WiFi 名称（SSID）                                               |
| - 信号强度（百分比 + 信号条图标）                                 |
| - 网络延迟（毫秒，带颜色标识等级）                                |
| - 连接速度（可选，如 866 Mbps）                                   |
| - 频段（可选，2.4GHz/5GHz）                                       |
| - MAC 地址（桌面端可选）                                          |
+------------------------------------------------------------------+
    |
    v
+------------------------------------------------------------------+
| 第二优先级：检查 WiFi 配置状态                                    |
| - 查找 config.wifiList 中是否有匹配的 SSID                        |
+------------------------------------------------------------------+
    |
    v
+---------------------+     未配置
| WiFi 是否已配置？    |---------------> [显示：该 WiFi 未配置]
+---------------------+                  [提示：请前往配置设置添加]
    | 已配置
    v
+------------------------------------------------------------------+
| 第三优先级：检查认证需求                                          |
| - 读取 wifiConfig.requiresAuth                                   |
+------------------------------------------------------------------+
    |
    v
+--------------------+      不需要认证
| 是否需要认证？      |---------------> [显示：无需认证]
+--------------------+                  [说明：如家庭WiFi/热点]
    | 需要认证                           [不显示登录/登出按钮]
    v
+------------------------------------------------------------------+
| 第四优先级：检查账户配置                                          |
| - 读取 wifiConfig.linkedAccountId                                |
| - 查找 config.accounts 中对应的账户                              |
+------------------------------------------------------------------+
    |
    v
+--------------------+      未配置账户
| 是否已关联账户？    |---------------> [显示：请配置账户]
+--------------------+                  [提示：前往配置设置关联账户]
    | 已关联账户
    v
+------------------------------------------------------------------+
| 显示完整认证界面                                                  |
| - 认证状态（已连接/未连接/连接中）                                |
| - IP 地址                                                        |
| - 当前账户信息                                                    |
| - 登录/登出按钮                                                   |
| - 心跳检测状态（如已开启）                                        |
+------------------------------------------------------------------+
```

#### 4.2 显示状态详细说明

| 状态                      | 显示内容                                                        | 可用操作                |
| ------------------------- | --------------------------------------------------------------- | ----------------------- |
| **未连接 WiFi**           | WiFi 图标（灰色）+ "未连接 WiFi"提示                            | 无                      |
| **已连接 + 未配置**       | WiFi 完整信息（名称、信号强度、延迟、连接速度等）+ "该 WiFi 未配置"警告 | 跳转到配置页面    |
| **已配置 + 无需认证**     | WiFi 完整信息 + "无需认证"标识                                  | 无                      |
| **需认证 + 未配置账户**   | WiFi 完整信息 + "请配置账户"警告                                | 跳转到账户配置          |
| **需认证 + 已配置账户**   | WiFi 完整信息 + 认证状态 + IP 地址 + 账户信息 + 登录/登出按钮  | 登录、登出、查看详情    |

**WiFi 完整信息包含**：
- WiFi 名称（SSID）
- 信号强度（百分比，带可视化图标：如 📶 85%）
- 网络延迟（毫秒，带颜色等级标识：如 <span style="color:green">25ms</span>）
- 连接速度（可选，如 866 Mbps）
- 频段（可选，如 5GHz）
- MAC 地址（桌面端可选）

**延迟颜色标识**：
- < 50ms：绿色（优秀）
- 50-100ms：蓝色（良好）
- 100-200ms：黄色（一般）
- > 200ms：橙色（较差）
- 超时：红色（无法连接）

#### 4.3 实现要点

1. **WiFi 检测独立性**：WiFi 连接状态检测应独立于任何配置检查，在组件初始化时立即执行
2. **信息分层显示**：按优先级顺序逐步检查和显示，不要因为缺少配置而跳过前面的步骤
3. **错误处理**：每一层检查都应有对应的提示和引导，而不是简单地不显示
4. **实时更新**：WiFi 连接状态应实时监听和更新，不受配置变化的影响

#### 4.4 关键判断逻辑

```typescript
// 运行状态页面的显示逻辑伪代码
function renderHomeScreen() {
  // 第一优先级：获取 WiFi 状态（始终执行）
  const wifiStatus = await getWifiStatus(); // { connected, ssid, signalStrength, latency }

  if (!wifiStatus.connected) {
    return <NotConnectedView />;
  }

  // 显示 WiFi 基础信息（必须显示）
  displayWifiInfo(wifiStatus);

  // 第二优先级：检查 WiFi 配置
  const wifiConfig = config.wifiList.find(w => w.ssid === wifiStatus.ssid);

  if (!wifiConfig) {
    return <WifiNotConfiguredView wifiInfo={wifiStatus} />;
  }

  // 第三优先级：检查是否需要认证
  if (!wifiConfig.requiresAuth) {
    return <NoAuthRequiredView wifiInfo={wifiStatus} />;
  }

  // 第四优先级：检查账户配置
  const account = config.accounts.find(a => a.id === wifiConfig.linkedAccountId);

  if (!account) {
    return <AccountNotConfiguredView wifiInfo={wifiStatus} />;
  }

  // 显示完整认证界面
  return <FullAuthView wifiInfo={wifiStatus} account={account} />;
}
```

## 配置模型

```typescript
// 完整的应用配置
interface AppConfig {
  // 账户配置（支持多账户）
  accounts: AccountConfig[];
  currentAccountId: string | null; // 当前使用的账户 ID

  // WiFi 配置（支持多个）
  wifiList: WifiConfig[];

  // 应用设置
  settings: AppSettings;
}

interface AccountConfig {
  id: string; // 账户唯一标识
  name: string; // 账户名称（显示用）
  username: string; // 校园网账号
  password: string; // 校园网密码（加密存储）
  serverUrl: string; // 认证服务器地址（可自定义，有默认值）
  isp: 'campus' | 'cmcc' | 'cucc' | 'ctcc'; // 服务商选择
}

interface WifiConfig {
  id: string; // WiFi 配置唯一标识
  ssid: string; // WiFi 名称
  password: string; // WiFi 密码（加密存储）
  autoConnect: boolean; // 是否自动连接
  requiresAuth: boolean; // 是否需要校园网认证登录
  linkedAccountId?: string; // 关联的账号ID（仅当 requiresAuth 为 true）
  priority: number; // 优先级（1-99，数字越小优先级越高，默认10）
}

interface AppSettings {
  autoLaunch: boolean; // 开机自启
  enableHeartbeat: boolean; // 是否启用心跳检测
  pollingInterval: number; // 轮询间隔（秒）
  autoReconnect: boolean; // 自动重连
  maxRetries: number; // 最大重试次数
  showNotification: boolean; // 显示通知
  autoUpdate: boolean; // 自动检查更新
}
```

### WiFi 认证配置说明

WiFi 配置支持两种类型：

1. **需要校园网认证的 WiFi** (`requiresAuth: true`)
   - 连接后需要向认证服务器发送登录请求
   - 必须通过 `linkedAccountId` 关联一个已配置的账号
   - 使用关联账号的服务器地址和服务商信息

2. **无需认证的 WiFi** (`requiresAuth: false`)
   - 家庭 WiFi、手机热点等
   - 仅连接即可使用，无需发送登录请求

### WiFi 优先级颜色标识

为了直观显示 WiFi 配置的优先级，UI 层应根据优先级数值使用不同的颜色标识：

| 优先级范围 | 颜色代码  | 颜色名称 | 优先级描述 | 使用场景                     |
| ---------- | --------- | -------- | ---------- | ---------------------------- |
| 1-3        | `#ef4444` | 红色     | 最高优先级 | 主要使用的校园网 WiFi        |
| 4-6        | `#f97316` | 橙色     | 高优先级   | 备用校园网 WiFi              |
| 7-10       | `#3b82f6` | 蓝色     | 中等优先级 | 默认优先级，家庭 WiFi         |
| 11-20      | `#22c55e` | 绿色     | 低优先级   | 偶尔使用的网络               |
| 21+        | `#6b7280` | 灰色     | 最低优先级 | 很少使用的备用网络，手机热点 |

**实现要求**：

1. **WiFi 列表显示**：在 WiFi 配置列表中，优先级徽章应使用对应的颜色显示
2. **输入框防误触**：优先级输入框应禁用鼠标滚轮改值功能，使用 `onWheel blur` 处理
3. **一致性**：桌面端和移动端应使用相同的颜色方案，确保用户体验一致

**实现示例** (TypeScript)：

```typescript
function getPriorityColor(priority: number): string {
  if (priority <= 3) return '#ef4444'; // 红色 - 最高优先级
  if (priority <= 6) return '#f97316'; // 橙色 - 高优先级
  if (priority <= 10) return '#3b82f6'; // 蓝色 - 中等优先级
  if (priority <= 20) return '#22c55e'; // 绿色 - 低优先级
  return '#6b7280'; // 灰色 - 最低优先级
}
```

### 心跳检测与 WiFi 切换流程

```
+-----------------+
|  Enable         |
|  Heartbeat      |
+--------+--------+
         |
         v
+-----------------+
|  Timed Polling  | <----------------------+
+--------+--------+                        |
         |                                 |
         v                                 |
    +--------+      Yes                    |
    | Network |-----------------------------+
    | OK?     |
    +----+----+
         | No
         v
+-----------------+
|  Try Reconnect  |
| (max N retries) |
+--------+--------+
         |
         v
    +---------+     Yes
    | Reconnect|------------------------+
    | Success? |                        |
    +----+-----+                        |
         | No                           |
         v                              |
+-----------------+                     |
| Switch WiFi     |                     |
| by Priority     |                     |
+--------+--------+                     |
         |                              |
         v                              |
    +-------------+                     |
    | requiresAuth|                     |
    +------+------+                     |
     Yes   |    No                      |
        v    v                          |
+---------+ +--------+                  |
| Send    | | Just   |                  |
| Login   | | Connect|                  |
| Request | | WiFi   |                  |
+----+----+ +----+---+                  |
     |           |                      |
     +-----+-----+                      |
           |                            |
           +----------------------------+
```

## 安全考虑

1. **密码存储**：使用系统级加密存储（Electron: safeStorage, Android: EncryptedSharedPreferences）
2. **网络传输**：敏感信息仅在本地使用，不上传到任何服务器
3. **日志脱敏**：日志中不记录密码等敏感信息

## 扩展性

项目设计支持以下扩展：

1. **新平台支持**：通过实现平台适配接口，可以轻松添加 iOS、Linux 等平台支持
2. **认证协议**：AuthService 设计为可扩展，支持添加其他认证方式
3. **UI 主题**：UI 层与业务逻辑分离，可以轻松更换 UI 框架或主题
