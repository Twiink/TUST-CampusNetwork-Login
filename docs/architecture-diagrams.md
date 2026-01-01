# NetMate 系统架构图解 (Mermaid版)

> 本文档使用 Mermaid 语法展示 NetMate 项目的系统架构。
>
> **提示**: 使用支持 Mermaid 渲染的编辑器（如 VS Code + Markdown Preview Mermaid Support）或在线工具（如 [Mermaid Live Editor](https://mermaid.live/)）查看图表。

---

## 目录

1. [整体架构](#1-整体架构)
2. [技术栈](#2-技术栈)
3. [数据流](#3-数据流)
4. [核心服务](#4-核心服务)
5. [平台适配](#5-平台适配)
6. [模块依赖](#6-模块依赖)
7. [状态管理](#7-状态管理)
8. [IPC通信](#8-ipc通信)
9. [心跳检测流程](#9-心跳检测流程)
10. [登录流程](#10-登录流程)

---

## 1. 整体架构

### 1.1 分层架构

```mermaid
flowchart TB
    subgraph Apps["应用层 (Apps)"]
        direction TB

        subgraph Desktop["桌面端 apps/desktop/"]
            EMain["Electron 主进程"]
            ERender["React 渲染进程"]
        end

        subgraph Mobile["移动端 apps/mobile/"]
            RNUI["React Native UI"]
            Android["Android 原生层"]
        end
    end

    subgraph Shared["共享层 packages/shared/"]
        Svc["核心服务"]
        Models["数据模型"]
        Types["类型定义"]
        Utils["工具函数"]
        Const["常量定义"]
    end

    subgraph System["系统层"]
        OS["操作系统 API"]
        Network["网络/HTTP"]
        WiFi["WiFi 栈"]
        FS["文件系统"]
    end

    Apps --> Shared
    Shared --> System

    style Apps fill:#e1f5fe
    style Shared fill:#fff3e0
    style System fill:#f3e5f5
```

### 1.2 组件交互

```mermaid
flowchart LR
    subgraph UI["UI 层"]
        Home["首页"]
        Settings["设置页"]
        Logs["日志页"]
        Sidebar["侧边栏"]
    end

    subgraph Hooks["React Hooks"]
        useAuth["useAuth"]
        useNetwork["useNetwork"]
        useConfig["useConfig"]
        useLogs["useLogs"]
    end

    subgraph IPC["IPC 通信"]
        AuthIPC["auth:*"]
        AccountIPC["account:*"]
        WifiIPC["wifi:*"]
        NetworkIPC["network:*"]
    end

    subgraph Services["平台服务"]
        Tray["托盘服务"]
        Store["存储服务"]
        Notify["通知服务"]
        WifiDetect["WiFi检测"]
        AutoReconnect["自动重连"]
    end

    subgraph Core["共享核心服务"]
        Auth["AuthService"]
        Network["NetworkDetector"]
        Account["AccountManager"]
        Wifi["WifiManager"]
        Config["ConfigManager"]
        Logger["Logger"]
    end

    UI --> Hooks
    Hooks --> IPC
    IPC --> Services
    Services --> Core

    style UI fill:#e3f2fd
    style Core fill:#fff8e1
    style Services fill:#fce4ec
```

---

## 2. 技术栈

### 2.1 技术栈概览

```mermaid
mindmap
    root((NetMate))
        Desktop
            Frontend
                React 18
                TypeScript
                Vite
                Zustand
            Backend
                Electron
                electron-store
                auto-launch
                electron-updater
        Mobile
            Frontend
                React Native
                TypeScript
                Metro
            Android
                Kotlin
                Foreground Service
                BOOT_COMPLETED
        Shared
            TypeScript
            tsup
            Vitest
```

### 2.2 技术选型

```mermaid
flowchart TB
    subgraph Root["项目根目录"]
        subgraph Pkg["packages/shared"]
            TS["TypeScript"]
            Tsup["tsup 构建"]
            Vitest["Vitest 测试"]
        end

        subgraph Desktop["apps/desktop"]
            Vite["Vite"]
            React["React"]
            Electron["Electron"]
            Store["electron-store"]
            Launch["auto-launch"]
            Updater["electron-updater"]
        end

        subgraph Mobile["apps/mobile"]
            RN["React Native"]
            Metro["Metro Bundler"]
            Storage["async-storage"]
            Keychain["keychain"]
            Notifee["@notifee/react-native"]
        end
    end

    Pkg -.-> Desktop
    Pkg -.-> Mobile

    style Pkg fill:#fff3e0
    style Desktop fill:#e3f2fd
    style Mobile fill:#e8f5e9
```

---

## 3. 数据流

### 3.1 数据流架构

```mermaid
flowchart TB
    subgraph Input["用户输入"]
        Click["点击按钮"]
        Form["表单提交"]
        Toggle["开关切换"]
    end

    subgraph UI["UI 层"]
        Component["React 组件"]
        Hook["自定义 Hook"]
        Context["Context"]
    end

    subgraph Store["状态层"]
        Zustand["Zustand Store"]
    end

    subgraph Platform["平台适配层"]
        IPC["IPC (桌面端)"]
        Native["Native Bridge (移动端)"]
    end

    subgraph Core["共享服务层"]
        AuthService["AuthService"]
        NetworkService["NetworkDetector"]
        AccountService["AccountManager"]
        WifiService["WifiManager"]
        ConfigService["ConfigManager"]
        LoggerService["Logger"]
    end

    subgraph External["外部服务"]
        AuthServer["校园网认证服务器"]
        GitHub["GitHub Releases"]
    end

    Input --> UI
    UI --> Store
    Store --> Platform
    Platform --> Core
    Core --> External

    style Input fill:#e8f5e9
    style Core fill:#fff8e1
    style External fill:#ffebee
```

### 3.2 数据流方向

```mermaid
flowchart LR
    subgraph User["用户"]
        Action["操作"]
    end

    subgraph App["应用"]
        direction TB
        UI["UI 渲染"]
        State["状态管理"]
        Service["业务逻辑"]
    end

    subgraph External["外部"]
        Server["认证服务器"]
    end

    User -->|"1. 用户操作"| UI
    UI -->|"2. 更新状态"| State
    State -->|"3. 调用服务"| Service
    Service -->|"4. 网络请求"| Server
    Server -->|"5. 响应结果"| Service
    Service -->|"6. 更新状态"| State
    State -->|"7. 刷新UI"| UI

    style User fill:#e3f2fd
    style App fill:#fff3e0
    style External fill:#fce4ec
```

---

## 4. 核心服务

### 4.1 服务类结构

```mermaid
classDiagram
    class AuthService {
        -serverUrl: string
        +setServerUrl(url: string): void
        +getServerUrl(): string
        +buildLoginUrl(config: LoginConfig): string
        +parseLoginResponse(response: string): LoginResult
        +login(config: LoginConfig): Promise~LoginResult~
        +logout(wlanUserIp: string): Promise~LogoutResult~
    }

    class NetworkDetector {
        -pollingTimer: Timer
        -callback: NetworkCallback
        +checkConnectivity(): Promise~boolean~
        +isAuthenticated(): Promise~boolean~
        +startPolling(interval: number, callback: NetworkCallback): void
        +stopPolling(): void
    }

    class AccountManager {
        -configManager: ConfigManager
        +getAccounts(): AccountConfig[]
        +getCurrentAccount(): AccountConfig | null
        +addAccount(account): Promise~AccountConfig~
        +removeAccount(id): Promise~void~
        +switchAccount(id): Promise~AccountConfig~
    }

    class WifiManager {
        -configManager: ConfigManager
        +getWifiConfigs(): WifiConfig[]
        +addWifi(wifi): Promise~WifiConfig~
        +removeWifi(id): Promise~void~
        +matchWifi(ssid): WifiConfig | null
    }

    class ConfigManager {
        -storage: StorageAdapter
        -config: AppConfig | null
        +load(): Promise~void~
        +save(): Promise~void~
        +getConfig(): AppConfig
        +update(partial): Promise~void~
    }

    class RetryPolicy {
        -maxRetries: number
        -delay: number
        -backoff: 'fixed' | 'exponential'
        +execute~T~(operation, options): Promise~T~
        +setMaxRetries(n: number): void
    }

    class Logger {
        -logs: LogEntry[]
        -maxLogs: number
        +info(message, data?): void
        +success(message, data?): void
        +warn(message, data?): void
        +error(message, error?): void
        +debug(message, data?): void
        +getLogs(options?): LogEntry[]
        +clearLogs(): void
    }

    AccountManager --> ConfigManager
    WifiManager --> ConfigManager
```

### 4.2 服务关系

```mermaid
flowchart TB
    subgraph Services["核心服务"]
        A["AccountManager"]
        W["WifiManager"]
        C["ConfigManager"]
        Au["AuthService"]
        N["NetworkDetector"]
        R["RetryPolicy"]
        L["Logger"]
    end

    A --> C
    W --> C
    Au -.-> C
    N --> L
    R -.-> Au
    R -.-> N

    style Services fill:#fff8e1
```

---

## 5. 平台适配

### 5.1 存储适配器

```mermaid
flowchart TB
    subgraph Interface["StorageAdapter 接口"]
        I1["get<T>(key): Promise<T | null>"]
        I2["set<T>(key, value): Promise<void>"]
        I3["remove(key): Promise<void>"]
        I4["clear(): Promise<void>"]
    end

    subgraph Implementations["实现"]
        D["DesktopStorage"]
        M["MobileStorage"]
        T["TestStorage"]
    end

    D -->|"electron-store + safeStorage"| Interface
    M -->|"async-storage + keychain"| Interface
    T -->|"Map 对象"| Interface

    style Interface fill:#e3f2fd
    style Implementations fill:#fff8e1
```

### 5.2 WiFi 适配器

```mermaid
flowchart TB
    subgraph Interface["WifiAdapter 接口"]
        G["getCurrentWifi(): Promise<WifiInfo | null>"]
        C["connect(ssid, password): Promise<boolean>"]
        D["disconnect(): Promise<void>"]
        S["scan(): Promise<WifiInfo[]>"]
    end

    subgraph Implementations["实现"]
        DW["DesktopWifi"]
        MW["MobileWifi"]
    end

    DW -->|"netsh / networksetup"| Interface
    MW -->|"WifiModule.kt"| Interface

    style Interface fill:#e3f2fd
    style Implementations fill:#e8f5e9
```

---

## 6. 模块依赖

### 6.1 包依赖关系

```mermaid
flowchart TB
    subgraph Desktop["apps/desktop"]
        E["electron/"]
        S["src/"]
    end

    subgraph Mobile["apps/mobile"]
        A["android/"]
        R["src/"]
    end

    subgraph Shared["packages/shared"]
        SH["shared/"]
    end

    E -->|"使用"| SH
    S -->|"使用"| SH
    R -->|"使用"| SH
    A -.->|"原生模块"| R

    style SH fill:#fff8e1
```

### 6.2 内部依赖

```mermaid
flowchart TB
    subgraph Desktop["桌面端"]
        Main["main.ts"]
        IPC["ipc/"]
        Services["services/"]
        UI["src/"]
    end

    Main --> IPC
    IPC --> Services
    UI --> IPC

    subgraph Mobile["移动端"]
        App["App.tsx"]
        Screens["screens/"]
        Hooks["hooks/"]
        Native["native/"]
    end

    App --> Screens
    App --> Hooks
    Hooks --> Native

    style Desktop fill:#e3f2fd
    style Mobile fill:#e8f5e9
```

---

## 7. 状态管理

### 7.1 Zustand Store 结构

```mermaid
classDiagram
    class AppState {
        +accounts: AccountConfig[]
        +currentAccountId: string | null
        +wifiConfigs: WifiConfig[]
        +settings: AppSettings
        +networkStatus: NetworkStatus
        +isLoggedIn: boolean
        +logs: LogEntry[]
        +setAccounts(accounts): void
        +addAccount(account): void
        +removeAccount(id): void
        +switchAccount(id): void
        +setWifiConfigs(configs): void
        +updateSettings(settings): void
        +setNetworkStatus(status): void
        +setLoggedIn(loggedIn): void
        +addLog(log): void
        +clearLogs(): void
    }

    class AccountConfig {
        +id: string
        +name: string
        +username: string
        +password: string
        +serverUrl: string
        +isp: ISP
    }

    class WifiConfig {
        +id: string
        +ssid: string
        +password: string
        +autoConnect: boolean
        +requiresAuth: boolean
        +linkedAccountId?: string
        +priority: number
    }

    class AppSettings {
        +autoLaunch: boolean
        +enableHeartbeat: boolean
        +pollingInterval: number
        +autoReconnect: boolean
        +maxRetries: number
        +showNotification: boolean
        +autoUpdate: boolean
    }

    AppState --> AccountConfig
    AppState --> WifiConfig
    AppState --> AppSettings
```

### 7.2 状态流

```mermaid
flowchart LR
    subgraph Store["Zustand Store"]
        State["全局状态"]
    end

    subgraph Context["React Context"]
        Provider["AppProvider"]
    end

    subgraph Components["React 组件"]
        Home["首页"]
        Settings["设置"]
        Logs["日志"]
    end

    Components -->|"读取"| Context
    Components -->|"更新"| Context
    Context --> Store

    style Store fill:#fff8e1
```

---

## 8. IPC通信

### 8.1 IPC 通道

```mermaid
flowchart TB
    subgraph Renderer["渲染进程"]
        Hook["Hooks"]
        API["preload API"]
    end

    subgraph IPC["IPC 通道"]
        Auth["auth:*"]
        Account["account:*"]
        Wifi["wifi:*"]
        Config["config:*"]
        Network["network:*"]
        Log["log:*"]
        Tray["tray:*"]
        Notify["notify:*"]
    end

    subgraph Main["主进程"]
        Handler["IPC Handlers"]
        Services["平台服务"]
    end

    subgraph Core["共享服务"]
        AuthService["AuthService"]
        AccountManager["AccountManager"]
    end

    Renderer --> IPC
    IPC --> Main
    Main --> Services
    Services --> Core

    style IPC fill:#fce4ec
```

### 8.2 通信流程

```mermaid
sequenceDiagram
    participant R as 渲染进程
    participant P as preload
    participant I as IPC
    participant M as 主进程
    participant S as 共享服务

    R->>P: invoke('auth:login', config)
    P->>I: ipcRenderer.invoke('auth:login', config)
    I->>M: channel: auth:login
    M->>S: authService.login(config)
    S-->>M: LoginResult
    M-->>I: result
    I-->>P: result
    P-->>R: result

    Note over R,S: 响应式更新
    S->>M: logger.info(...)
    M-->>R: 'log:new' 事件
```

---

## 9. 心跳检测流程

```mermaid
flowchart TB
    Start(["启动心跳检测"])
    Check{检查网络连通性}
    Normal[网络正常]
    Disconnect[网络断开]
    Retry[尝试重新登录]
    ReconnectOK{重连成功}
    Switch[按优先级切换 WiFi]
    Connect[连接 WiFi]
    NeedAuth{需要认证}
    Login[发送登录请求]
    Wait[等待下一次检测]

    Start --> Check
    Check -->|是| Normal
    Normal --> Wait
    Wait -->|"间隔时间"| Check

    Check -->|否| Disconnect
    Disconnect --> Retry
    Retry --> ReconnectOK

    ReconnectOK -->|是| Wait
    ReconnectOK -->|否| Switch

    Switch --> Connect
    Connect --> NeedAuth
    NeedAuth -->|是| Login
    NeedAuth -->|否| Wait
    Login -->|成功| Disconnect

    style Start fill:#4caf50
    style Check fill:#2196f3
    style Disconnect fill:#ff9800
    style ReconnectOK fill:#ff9800
    style Switch fill:#f44336
```

---

## 10. 登录流程

### 10.1 登录序列图

```mermaid
sequenceDiagram
    participant User as 用户
    participant UI as React UI
    participant Hook as useAuth
    participant IPC as IPC
    participant Main as 主进程
    participant Auth as AuthService
    participant Server as 认证服务器

    User->>UI: 点击登录按钮
    UI->>Hook: login()
    Hook->>IPC: invoke('auth:login', config)
    IPC->>Main: auth:login
    Main->>Auth: login(config)

    Note over Auth,Server: 构建登录 URL

    Auth->>Server: GET loginUrl
    Server-->>Auth: 响应
    Auth->>Auth: 解析响应

    alt 登录成功
        Auth-->>Main: { success: true, message: '...' }
        Main-->>IPC: result
        IPC-->>Hook: result
        Hook-->>UI: { success: true }
        UI->>UI: 更新状态 + 通知
        UI-->>User: 显示成功
    else 登录失败
        Auth-->>Main: { success: false, message: '...' }
        Main-->>IPC: result
        IPC-->>Hook: result
        Hook-->>UI: { success: false }
        UI-->>User: 显示错误
    end
```

### 10.2 登录状态机

```mermaid
stateDiagram-v2
    [*] --> 断开: 启动应用

    断开 --> 连接中: 用户点击登录
    连接中 --> 已连接: 登录成功
    连接中 --> 断开: 登录失败

    已连接 --> 检测中: 启用心跳检测
    检测中 --> 已连接: 网络正常
    检测中 --> 断开: 检测到断线

    断开 --> 连接中: 自动重连
    断开 --> [*]: 用户退出

    已连接 --> [*]: 用户登出
```

---

## 11. 配置模型

```mermaid
erDiagram
    AppConfig ||--o{ AccountConfig : contains
    AppConfig ||--o{ WifiConfig : contains
    AppConfig ||--|| AppSettings : has

    AccountConfig {
        string id PK
        string name
        string username
        string password
        string serverUrl
        string isp
    }

    WifiConfig {
        string id PK
        string ssid
        string password
        boolean autoConnect
        boolean requiresAuth
        string linkedAccountId FK
        int priority
    }

    AppSettings {
        boolean autoLaunch
        boolean enableHeartbeat
        int pollingInterval
        boolean autoReconnect
        int maxRetries
        boolean showNotification
        boolean autoUpdate
    }

    AccountConfig ||--o{ WifiConfig : "关联"
```

---

## 12. 安全架构

```mermaid
flowchart TB
    subgraph Storage["密码存储"]
        DesktopS["electron-store + safeStorage"]
        MobileS["async-storage + keychain"]
    end

    subgraph Logging["日志脱敏"]
        Mask["敏感字段过滤"]
    end

    subgraph Isolation["上下文隔离"]
        Preload["preload.ts 最小化 API"]
    end

    subgraph Transport["传输安全"]
        HTTPS["HTTPS 请求"]
        Local["本地处理敏感信息"]
    end

    DesktopS --> Storage
    MobileS --> Storage
    Mask --> Logging
    Preload --> Isolation
    HTTPS --> Transport
    Local --> Transport

    style Storage fill:#ffebee
    style Logging fill:#fff8e1
    style Isolation fill:#e3f2fd
    style Transport fill:#e8f5e9
```

---

## 附录: 快速参考

### A. 关键文件路径

| 模块 | 路径 |
|------|------|
| 共享服务 | `packages/shared/src/services/` |
| 类型定义 | `packages/shared/src/types/` |
| 桌面端主进程 | `apps/desktop/electron/` |
| 桌面端UI | `apps/desktop/src/` |
| 移动端 | `apps/mobile/src/` |
| Android原生 | `apps/mobile/android/` |

### B. IPC 通道列表

| 通道 | 功能 |
|------|------|
| `auth:*` | 登录/登出 |
| `account:*` | 账户管理 |
| `wifi:*` | WiFi 配置 |
| `config:*` | 配置读写 |
| `network:*` | 网络状态 |
| `log:*` | 日志操作 |
| `tray:*` | 托盘控制 |
| `notify:*` | 通知管理 |
| `updater:*` | 更新检查 |

---

*文档版本: 1.0*
*最后更新: 2026-01-02*
