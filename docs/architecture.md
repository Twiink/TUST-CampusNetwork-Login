# 项目架构设计

本文档详细描述 NetMate 项目的目录结构和架构设计。

## 整体架构

采用 pnpm Monorepo 架构，实现代码共享和统一管理：

```
┌────────────────────────────────────────────────────────────────────────┐
│                             Monorepo Root                               │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         apps/ (应用层)                           │   │
│  │  ┌────────────────────┐    ┌────────────────────────────────┐   │   │
│  │  │      desktop/      │    │           mobile/              │   │   │
│  │  │   Electron App     │    │      React Native App          │   │   │
│  │  │   (Win + macOS)    │    │         (Android)              │   │   │
│  │  └────────────────────┘    └────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                    │
│                                    ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       packages/ (共享层)                         │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │                       shared/                           │    │   │
│  │  │              核心业务逻辑 (跨平台共享)                    │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

## 详细目录结构

```
NetMate/
├── .github/                          # GitHub 配置
│   └── workflows/                    # CI/CD 工作流
│       ├── desktop-build.yml         # 桌面端构建
│       └── mobile-build.yml          # 移动端构建
│
├── apps/                             # 应用目录
│   │
│   ├── desktop/                      # Electron 桌面应用
│   │   ├── electron/                 # Electron 主进程
│   │   │   ├── main.ts               # 主进程入口
│   │   │   ├── preload.ts            # 预加载脚本
│   │   │   ├── ipc/                  # IPC 通信模块
│   │   │   │   ├── index.ts          # IPC 处理器注册
│   │   │   │   ├── auth.ts           # 认证相关 IPC
│   │   │   │   ├── config.ts         # 配置相关 IPC
│   │   │   │   └── network.ts        # 网络相关 IPC
│   │   │   ├── services/             # 平台服务
│   │   │   │   ├── tray.ts           # 系统托盘
│   │   │   │   ├── autoLaunch.ts     # 开机自启
│   │   │   │   ├── notification.ts   # 系统通知
│   │   │   │   └── store.ts          # 本地存储
│   │   │   └── utils/                # 工具函数
│   │   │       └── network.ts        # 网络工具（获取 IP/MAC）
│   │   ├── src/                      # 渲染进程（React）
│   │   │   ├── main.tsx              # 入口文件
│   │   │   ├── App.tsx               # 根组件
│   │   │   ├── components/           # UI 组件
│   │   │   │   ├── common/           # 通用组件
│   │   │   │   │   ├── Button.tsx
│   │   │   │   │   ├── Input.tsx
│   │   │   │   │   └── Switch.tsx
│   │   │   │   ├── AccountForm.tsx   # 账户配置表单
│   │   │   │   ├── WifiForm.tsx      # WiFi 配置表单
│   │   │   │   ├── SettingsForm.tsx  # 设置表单
│   │   │   │   ├── StatusPanel.tsx   # 状态面板
│   │   │   │   └── LogViewer.tsx     # 日志查看器
│   │   │   ├── pages/                # 页面
│   │   │   │   ├── Home.tsx          # 主页（状态概览）
│   │   │   │   ├── Settings.tsx      # 设置页
│   │   │   │   └── Logs.tsx          # 日志页
│   │   │   ├── hooks/                # React Hooks
│   │   │   │   ├── useConfig.ts      # 配置 Hook
│   │   │   │   ├── useNetwork.ts     # 网络状态 Hook
│   │   │   │   └── useAuth.ts        # 认证 Hook
│   │   │   ├── stores/               # 状态管理
│   │   │   │   └── index.ts          # Zustand Store
│   │   │   ├── styles/               # 样式文件
│   │   │   │   ├── index.css         # 全局样式
│   │   │   │   └── variables.css     # CSS 变量
│   │   │   └── types/                # 类型定义
│   │   │       └── electron.d.ts     # Electron API 类型
│   │   ├── public/                   # 静态资源
│   │   │   └── icons/                # 应用图标
│   │   ├── resources/                # 打包资源
│   │   │   ├── icon.ico              # Windows 图标
│   │   │   └── icon.icns             # macOS 图标
│   │   ├── electron-builder.json5    # 打包配置
│   │   ├── vite.config.ts            # Vite 配置
│   │   ├── tsconfig.json             # TypeScript 配置
│   │   └── package.json
│   │
│   └── mobile/                       # React Native 移动应用
│       ├── android/                  # Android 原生代码
│       │   ├── app/
│       │   │   └── src/main/java/    # Java/Kotlin 代码
│       │   │       └── modules/      # 原生模块
│       │   │           ├── WifiModule.kt      # WiFi 控制
│       │   │           └── AutoStartModule.kt # 开机自启
│       │   └── build.gradle
│       ├── ios/                      # iOS 原生代码（预留）
│       ├── src/                      # React Native 代码
│       │   ├── App.tsx               # 根组件
│       │   ├── components/           # UI 组件
│       │   │   ├── common/           # 通用组件
│       │   │   ├── AccountForm.tsx
│       │   │   ├── WifiForm.tsx
│       │   │   ├── SettingsForm.tsx
│       │   │   └── StatusPanel.tsx
│       │   ├── screens/              # 页面
│       │   │   ├── HomeScreen.tsx
│       │   │   ├── SettingsScreen.tsx
│       │   │   └── LogsScreen.tsx
│       │   ├── navigation/           # 导航配置
│       │   │   └── index.tsx
│       │   ├── hooks/                # React Hooks
│       │   ├── services/             # 平台服务
│       │   │   ├── wifi.ts           # WiFi 控制
│       │   │   ├── notification.ts   # 通知
│       │   │   ├── background.ts     # 后台服务
│       │   │   └── storage.ts        # 存储
│       │   ├── stores/               # 状态管理
│       │   └── types/                # 类型定义
│       ├── index.js                  # 入口文件
│       ├── metro.config.js           # Metro 配置
│       ├── babel.config.js           # Babel 配置
│       └── package.json
│
├── packages/                         # 共享包目录
│   │
│   └── shared/                       # 核心业务包
│       ├── src/
│       │   ├── index.ts              # 导出入口
│       │   │
│       │   ├── services/             # 核心服务
│       │   │   ├── index.ts          # 服务导出
│       │   │   ├── AuthService.ts    # 登录认证服务
│       │   │   │   - login()         # 执行登录
│       │   │   │   - logout()        # 执行登出
│       │   │   │   - buildLoginUrl() # 构建登录 URL
│       │   │   │
│       │   │   ├── NetworkDetector.ts # 联网探测服务
│       │   │   │   - checkConnectivity()   # 检查网络连通性
│       │   │   │   - isAuthenticated()     # 检查是否已认证
│       │   │   │   - startPolling()        # 开始轮询检测
│       │   │   │   - stopPolling()         # 停止轮询检测
│       │   │   │
│       │   │   ├── RetryPolicy.ts    # 重试策略
│       │   │   │   - execute()       # 执行带重试的操作
│       │   │   │   - setMaxRetries() # 设置最大重试次数
│       │   │   │   - setDelay()      # 设置重试延迟
│       │   │   │
│       │   │   └── ConfigManager.ts  # 配置管理
│       │   │       - get()           # 获取配置
│       │   │       - set()           # 设置配置
│       │   │       - validate()      # 验证配置
│       │   │
│       │   ├── utils/                # 工具函数
│       │   │   ├── index.ts          # 工具导出
│       │   │   ├── urlEncode.ts      # URL 编码
│       │   │   ├── httpClient.ts     # HTTP 客户端封装
│       │   │   └── validator.ts      # 数据验证
│       │   │
│       │   ├── models/               # 数据模型
│       │   │   ├── index.ts          # 模型导出
│       │   │   ├── Logger.ts         # 日志模型
│       │   │   │   - info()          # 信息日志
│       │   │   │   - warn()          # 警告日志
│       │   │   │   - error()         # 错误日志
│       │   │   │   - getLogs()       # 获取日志列表
│       │   │   │
│       │   │   └── Config.ts         # 配置模型
│       │   │       - AccountConfig   # 账户配置
│       │   │       - WifiConfig      # WiFi 配置
│       │   │       - AppConfig       # 应用配置
│       │   │
│       │   ├── types/                # 类型定义
│       │   │   ├── index.ts          # 类型导出
│       │   │   ├── auth.ts           # 认证相关类型
│       │   │   ├── config.ts         # 配置相关类型
│       │   │   ├── network.ts        # 网络相关类型
│       │   │   └── log.ts            # 日志相关类型
│       │   │
│       │   └── constants/            # 常量定义
│       │       ├── index.ts          # 常量导出
│       │       ├── defaults.ts       # 默认值
│       │       └── errors.ts         # 错误码
│       │
│       ├── tsup.config.ts            # 构建配置
│       ├── tsconfig.json             # TypeScript 配置
│       └── package.json
│
├── docs/                             # 项目文档
│   ├── architecture.md               # 架构设计（本文档）
│   ├── api.md                        # API 文档
│   └── development.md                # 开发指南
│
├── shell/                            # 参考脚本
│   └── base.sh                       # 登录脚本参考
│
├── .github/                          # GitHub 配置
├── .eslintrc.cjs                     # ESLint 配置
├── .prettierrc.cjs                   # Prettier 配置
├── .gitignore                        # Git 忽略配置
├── package.json                      # 根 package.json
├── pnpm-workspace.yaml               # pnpm 工作区配置
├── pnpm-lock.yaml                    # 依赖锁定文件
└── README.md                         # 项目说明
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
  serverUrl: string;      // 认证服务器地址
  userAccount: string;    // 用户账号
  userPassword: string;   // 用户密码
  wlanUserIp: string;     // IPv4 地址
  wlanUserIpv6?: string;  // IPv6 地址
  wlanUserMac?: string;   // MAC 地址
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
  connected: boolean;      // 网络是否连接
  authenticated: boolean;  // 是否已认证
  wifiConnected: boolean;  // WiFi 是否连接
  ssid?: string;          // 当前 WiFi SSID（若已连接）
  ip?: string;            // 当前 IP
}
```

#### 1.3 RetryPolicy - 重试策略

提供通用的重试机制。

```typescript
interface RetryPolicy {
  // 执行带重试的异步操作
  execute<T>(
    operation: () => Promise<T>,
    options?: RetryOptions
  ): Promise<T>;
}

interface RetryOptions {
  maxRetries: number;      // 最大重试次数
  delay: number;           // 重试延迟（毫秒）
  backoff?: 'fixed' | 'exponential';  // 延迟策略
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
  ssid: string;           // WiFi 名称
  bssid?: string;
  signalStrength?: number;
  connected: boolean;     // 是否已连接
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
用户操作
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                        UI 层                                 │
│  (React / React Native 组件)                                │
└─────────────────────────────────────────────────────────────┘
    │
    ▼ 调用 Hooks / Store Actions
┌─────────────────────────────────────────────────────────────┐
│                      状态管理层                              │
│  (Zustand Store)                                            │
└─────────────────────────────────────────────────────────────┘
    │
    ▼ 调用平台适配器 / 共享服务
┌─────────────────────────────────────────────────────────────┐
│                      服务层                                  │
│  ┌─────────────────┐    ┌────────────────────────────┐     │
│  │  平台适配器      │    │      共享服务               │     │
│  │  (Platform)     │    │  (packages/shared)         │     │
│  └─────────────────┘    └────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                      系统/网络层                             │
│  (OS APIs / HTTP Requests)                                  │
└─────────────────────────────────────────────────────────────┘
```

## 配置模型

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
  linkedAccountId?: string; // 关联的账号ID（仅当 requiresAuth 为 true）
  priority: number;         // 优先级（数字越小优先级越高）
}

interface AppSettings {
  autoLaunch: boolean;      // 开机自启
  enableHeartbeat: boolean; // 是否启用心跳检测
  pollingInterval: number;  // 轮询间隔（秒）
  autoReconnect: boolean;   // 自动重连
  maxRetries: number;       // 最大重试次数
  showNotification: boolean; // 显示通知
  autoUpdate: boolean;      // 自动检查更新
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
┌─────────────────┐
│  启用心跳检测    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  定时轮询检测    │ ◄──────────────────┐
└────────┬────────┘                     │
         │                              │
         ▼                              │
    ┌────────┐     是                  │
    │ 网络正常? ├───────────────────────┘
    └────┬───┘
         │ 否
         ▼
┌─────────────────┐
│  尝试重新登录    │
│ (最多 N 次重试)  │
└────────┬────────┘
         │
         ▼
    ┌────────┐     是
    │ 重连成功? ├───────────────────────┐
    └────┬───┘                          │
         │ 否                           │
         ▼                              │
┌─────────────────┐                     │
│ 按优先级切换WiFi  │                    │
└────────┬────────┘                     │
         │                              │
         ▼                              │
    ┌────────────┐                      │
    │requiresAuth?│                     │
    └─────┬──────┘                      │
     是 │    │ 否                       │
        ▼    ▼                          │
┌─────────┐ ┌────────┐                  │
│发送登录  │ │仅连接   │                  │
│请求     │ │WiFi    │                  │
└────┬────┘ └────┬───┘                  │
     │           │                      │
     └─────┬─────┘                      │
           │                            │
           └────────────────────────────┘
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
