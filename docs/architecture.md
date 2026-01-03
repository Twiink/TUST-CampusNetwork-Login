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

```typescript
interface NetworkDetector {
  // 检查网络连通性
  checkConnectivity(): Promise<boolean>;

  // 检查是否已通过校园网认证
  isAuthenticated(): Promise<boolean>;

  // 获取当前 WiFi 状态（启动时调用）
  getCurrentWifiStatus(): Promise<NetworkStatus>;

  // 开始轮询检测
  startPolling(interval: number, callback: NetworkCallback): void;

  // 停止轮询检测
  stopPolling(): void;
}

type NetworkCallback = (status: NetworkStatus) => void;

interface NetworkStatus {
  connected: boolean; // 网络是否连接
  authenticated: boolean; // 是否已认证
  wifiConnected: boolean; // WiFi 是否连接
  ssid?: string; // 当前 WiFi SSID（若已连接）
  ip?: string; // 当前 IP
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

  // 连接到指定 WiFi
  connect(ssid: string, password: string): Promise<boolean>;

  // 断开 WiFi
  disconnect(): Promise<void>;

  // 获取可用 WiFi 列表
  scan(): Promise<WifiInfo[]>;
}

interface WifiInfo {
  ssid: string; // WiFi 名称
  bssid?: string;
  signalStrength?: number;
  connected: boolean; // 是否已连接
}

// Desktop: 使用系统命令 (netsh/networksetup)
// Mobile: react-native-wifi-reborn
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
  priority: number; // 优先级（数字越小优先级越高）
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
