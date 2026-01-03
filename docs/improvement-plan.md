# NetMate 项目改进计划

> 本文档列出项目中存在的问题和改进建议，按优先级分类。

**优先级说明：**

- **P0**: 紧急/阻塞性问题，必须立即修复（安全漏洞、崩溃性 Bug）
- **P1**: 高优先级，应尽快修复（功能性 Bug、重要缺失功能）
- **P2**: 中优先级，计划内修复（代码质量、性能优化）
- **P3**: 低优先级，有时间再处理（优化建议、锦上添花功能）
- **P4**: 最低优先级，长期规划（架构重构、技术债务）

---

## 目录

1. [P0 - 紧急问题](#p0---紧急问题)
2. [P1 - 高优先级](#p1---高优先级)
3. [P2 - 中优先级](#p2---中优先级)
4. [P3 - 低优先级](#p3---低优先级)
5. [P4 - 长期规划](#p4---长期规划)
6. [改进统计](#改进统计)

---

## P0 - 紧急问题

### P0-001: 密码通过 URL 明文传输

**位置**: `packages/shared/src/services/AuthService.ts:60-83`

**问题描述**:
登录凭据（包括 `user_password`）作为 URL 查询参数通过 GET 请求传输，这会导致：

- 密码出现在浏览器历史记录中
- 密码被记录在服务器访问日志中
- 密码在网络传输中以明文形式暴露

**当前代码**:

```typescript
const params = new URLSearchParams({
  user_account: userAccount,
  user_password: config.password, // 危险！密码在 URL 中
  // ...
});
const url = `${this.serverUrl}${LOGIN_PATH}?${params.toString()}`;
```

**修复建议**:

```typescript
// 方案1: 改用 POST 请求
async login(config: LoginConfig): Promise<LoginResult> {
  const formData = new URLSearchParams({
    user_account: userAccount,
    user_password: config.password,
    // ...
  });

  const response = await fetch(`${this.serverUrl}${LOGIN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });
}

// 方案2: 如果服务器只支持 GET，至少对密码进行编码
const encodedPassword = encodeURIComponent(btoa(config.password));
```

**影响范围**: 所有平台（Desktop、Mobile）

---

### P0-002: 移动端密码未加密存储

**位置**: `apps/mobile/src/context/AppContext.tsx:248`

**问题描述**:
移动端使用 `AsyncStorage` 存储配置，但密码以明文形式保存，与桌面端使用 `safeStorage` 加密不同。

**当前代码**:

```typescript
// 直接保存，无加密
await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
```

**修复建议**:

```typescript
// 使用 react-native-keychain 存储敏感信息
import * as Keychain from 'react-native-keychain';

// 保存密码
await Keychain.setGenericPassword(account.username, account.password);

// 读取密码
const credentials = await Keychain.getGenericPassword();

// 或使用 react-native-encrypted-storage
import EncryptedStorage from 'react-native-encrypted-storage';
await EncryptedStorage.setItem('config', JSON.stringify(config));
```

**影响范围**: Mobile App

---

### P0-003: 方法名不匹配导致运行时错误

**位置**: `apps/mobile/src/context/AppContext.tsx:248, 341, 354, 386`

**问题描述**:
调用了不存在的方法，会导致应用崩溃：

- `configManager.updateConfig()` 不存在，应为 `update()`
- `accountManager.setCurrentAccount()` 不存在，应为 `switchAccount()`

**当前代码**:

```typescript
// Line 248 - 方法不存在
servicesRef.current?.configManager.updateConfig(newConfig);

// Line 341 - 方法不存在
await servicesRef.current.accountManager.setCurrentAccount(newAccount.id);
```

**修复建议**:

```typescript
// Line 248
servicesRef.current?.configManager.update(newConfig);

// Line 341
await servicesRef.current.accountManager.switchAccount(newAccount.id);
```

**影响范围**: Mobile App（启动时可能崩溃）

---

### P0-004: HTTP 协议传输敏感数据

**位置**: `packages/shared/src/constants/defaults.ts:3`

**问题描述**:
认证请求使用 HTTP 而非 HTTPS，所有数据（包括密码）在网络中明文传输。

**当前代码**:

```typescript
export const DEFAULT_SERVER_URL = 'http://10.10.102.50:801';
```

**修复建议**:

```typescript
// 如果服务器支持 HTTPS
export const DEFAULT_SERVER_URL = 'https://10.10.102.50:801';

// 如果服务器不支持 HTTPS，至少在代码中加警告注释
// WARNING: HTTP is insecure. Contact network admin for HTTPS support.
export const DEFAULT_SERVER_URL = 'http://10.10.102.50:801';

// 在 UI 中提示用户风险
if (serverUrl.startsWith('http://')) {
  logger.warn('使用不安全的 HTTP 连接，密码可能被窃取');
}
```

**影响范围**: 所有平台

---

### P0-005: 缺少 Error Boundary 导致白屏崩溃

**位置**: `apps/desktop/src/App.tsx`, `apps/mobile/src/App.tsx`

**问题描述**:
整个应用没有 Error Boundary，任何未捕获的错误都会导致白屏崩溃。

**当前代码**:

```typescript
// apps/desktop/src/main.tsx
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <App />  {/* 没有 ErrorBoundary 包裹 */}
    </AppProvider>
  </React.StrictMode>
);
```

**修复建议**:

```typescript
// components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    // 上报错误到监控服务
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-fallback">
          <h1>出错了</h1>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// main.tsx
<ErrorBoundary>
  <AppProvider>
    <App />
  </AppProvider>
</ErrorBoundary>
```

**影响范围**: 所有平台（Desktop、Mobile）

---

### P0-006: 验证函数存在但未被使用

**位置**: `packages/shared/src/utils/validator.ts:19-171`

**问题描述**:
项目中定义了完整的验证函数（账号验证、WiFi 配置验证、应用配置验证），但在实际代码中完全没有使用，导致用户可以输入无效数据。

**当前状态**:

```typescript
// validator.ts 中定义了这些函数，但从未被调用
export function validateAccountConfig(config: unknown): ValidationResult;
export function validateWifiConfig(config: unknown): ValidationResult;
export function validateAppConfig(config: unknown): ValidationResult;
```

**修复建议**:

```typescript
// 在添加账号时使用验证
// apps/desktop/src/hooks/useAccounts.ts
import { validateAccountConfig } from '@repo/shared';

const addAccount = async (account: AccountConfig) => {
  const validation = validateAccountConfig(account);
  if (!validation.valid) {
    throw new Error(`无效的账号配置: ${validation.errors.join(', ')}`);
  }
  // 继续添加...
};

// 在 IPC 处理器中验证
// apps/desktop/electron/ipc/account.ts
ipcMain.handle(IPC_CHANNELS.ACCOUNT_ADD, async (_, account) => {
  const validation = validateAccountConfig(account);
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '));
  }
  return accountManager.addAccount(account);
});
```

**影响范围**: 所有平台

---

## P1 - 高优先级

### P1-001: 缺少输入验证和清理

**位置**: `packages/shared/src/services/AuthService.ts:57-84`

**问题描述**:
用户输入（用户名、密码）直接使用，未进行验证或清理，可能导致注入攻击。

**修复建议**:

```typescript
// 添加输入验证工具
// packages/shared/src/utils/validator.ts

export function validateUsername(username: string): boolean {
  // 校园网账号通常为学号，只允许数字和字母
  return /^[a-zA-Z0-9]{6,20}$/.test(username);
}

export function sanitizeInput(input: string): string {
  // 移除危险字符
  return input.replace(/[<>\"\'&]/g, '');
}

// 在 AuthService 中使用
if (!validateUsername(config.username)) {
  throw new Error('用户名格式不正确');
}
const safeUsername = sanitizeInput(config.username);
```

---

### P1-002: 非空断言操作符滥用

**位置**: `packages/shared/src/services/ConfigManager.ts:117-140`

**问题描述**:
多处使用 `!` 非空断言操作符，如果 `config` 为 `null` 会导致运行时错误。

**当前代码**:

```typescript
this.config = { ...this.config!, ...partial };
this.config!.settings = { ...this.config!.settings, ...settings };
```

**修复建议**:

```typescript
async update(partial: Partial<AppConfig>): Promise<void> {
  if (!this.config) {
    throw new Error('Config not initialized. Call load() first.');
  }
  this.config = { ...this.config, ...partial };
  await this.save();
}

async updateSettings(settings: Partial<AppSettings>): Promise<void> {
  if (!this.config) {
    throw new Error('Config not initialized. Call load() first.');
  }
  this.config.settings = { ...this.config.settings, ...settings };
  await this.save();
}
```

---

### P1-003: 缺少单元测试

**位置**: 整个项目

**问题描述**:
项目几乎没有单元测试，只有一个空的移动端测试文件：

- `packages/shared/src/` 核心业务逻辑无测试
- `AuthService`、`ConfigManager`、`NetworkDetector` 等关键服务无测试

**修复建议**:

```typescript
// packages/shared/src/services/__tests__/AuthService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AuthService } from '../AuthService';

describe('AuthService', () => {
  describe('buildLoginUrl', () => {
    it('should build correct URL with campus ISP', () => {
      const service = new AuthService('http://test.com');
      const url = service.buildLoginUrl({
        username: 'testuser',
        password: 'testpass',
        isp: 'campus',
        ip: '10.0.0.1',
      });
      expect(url).toContain('user_account=testuser');
      expect(url).not.toContain('@'); // campus 不需要后缀
    });

    it('should add ISP suffix for cmcc', () => {
      const service = new AuthService('http://test.com');
      const url = service.buildLoginUrl({
        username: 'testuser',
        password: 'testpass',
        isp: 'cmcc',
        ip: '10.0.0.1',
      });
      expect(url).toContain('user_account=testuser%40cmcc');
    });
  });

  describe('login', () => {
    it('should return success for valid response', async () => {
      // Mock fetch...
    });
  });
});
```

**建议测试覆盖率目标**: 核心服务 > 80%

---

### P1-004: 错误处理不一致

**位置**: `packages/shared/src/models/Logger.ts:68-78`

**问题描述**:
多处静默吞掉错误，导致问题难以调试。

**当前代码**:

```typescript
} catch {
  // 忽略监听器错误
}

this.persistAdapter.save(this.logs).catch(() => {
  // 忽略持久化错误
});
```

**修复建议**:

```typescript
} catch (error) {
  console.error('Listener callback failed:', error);
  // 考虑移除失败的监听器
}

this.persistAdapter.save(this.logs).catch((error) => {
  console.error('Failed to persist logs:', error);
  // 可以设置一个标志，下次重试
  this.persistPending = true;
});
```

---

### P1-005: NetworkDetector 认证状态逻辑冗余

**位置**: `packages/shared/src/services/NetworkDetector.ts:49-81`

**问题描述**:
`authenticated` 字段永远等于 `connected`，失去了区分意义。

**当前代码**:

```typescript
async isAuthenticated(): Promise<boolean> {
  const hasInternet = await this.checkConnectivity();
  return hasInternet;  // 总是返回与 connectivity 相同的值
}

async getNetworkStatus(): Promise<NetworkStatus> {
  const connected = await this.checkConnectivity();
  const authenticated = connected;  // 冗余
}
```

**修复建议**:

```typescript
// 真正检查是否通过校园网认证
async isAuthenticated(): Promise<boolean> {
  try {
    const response = await this.httpClient.get(AUTH_CHECK_URL, {
      timeout: 5000,
    });
    // 解析认证状态页面
    const result = this.parseAuthStatus(response);
    return result.authenticated;
  } catch {
    return false;
  }
}

private parseAuthStatus(response: string): { authenticated: boolean } {
  // 根据校园网返回的状态页判断
  if (response.includes('已认证') || response.includes('result":1')) {
    return { authenticated: true };
  }
  return { authenticated: false };
}
```

---

### P1-006: 后台服务心跳检测未实现

**位置**: `apps/mobile/android/app/src/main/java/com/mobile/service/BackgroundService.kt:152-158`

**问题描述**:
Android 后台服务的心跳检测只更新通知，不执行实际网络检查。

**当前代码**:

```kotlin
private fun performHeartbeat() {
    // 这里只是更新通知，实际的网络检测由 React Native 层处理
}
```

**修复建议**:

```kotlin
private fun performHeartbeat() {
    CoroutineScope(Dispatchers.IO).launch {
        try {
            // 实际执行网络检查
            val isConnected = checkNetworkConnectivity()
            val isAuthenticated = checkAuthStatus()

            if (!isConnected || !isAuthenticated) {
                // 发送事件到 React Native 层
                sendEventToReactNative("networkStatusChanged", mapOf(
                    "connected" to isConnected,
                    "authenticated" to isAuthenticated
                ))

                // 可选：自动重连
                if (autoReconnectEnabled) {
                    attemptReconnect()
                }
            }

            updateNotification(isConnected, isAuthenticated)
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat failed", e)
        }
    }
}
```

---

### P1-007: 登录/登出请求无法取消

**位置**: `apps/desktop/electron/ipc/auth.ts:29-76`

**问题描述**:
长时间运行的登录请求无法被用户取消，也无法防止并发登录请求。

**修复建议**:

```typescript
// 添加请求取消支持
let currentLoginController: AbortController | null = null;

ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async () => {
  // 取消之前的请求
  if (currentLoginController) {
    currentLoginController.abort();
  }

  currentLoginController = new AbortController();

  try {
    const result = await authService.login(config, {
      signal: currentLoginController.signal,
    });
    return result;
  } finally {
    currentLoginController = null;
  }
});

// 添加取消接口
ipcMain.handle(IPC_CHANNELS.AUTH_CANCEL, async () => {
  if (currentLoginController) {
    currentLoginController.abort();
    currentLoginController = null;
    return true;
  }
  return false;
});
```

---

### P1-008: 网络请求缺少重试机制

**位置**: `packages/shared/src/services/AuthService.ts:125-144`

**问题描述**:
登录和登出请求在网络波动时没有自动重试机制，而 `RetryPolicy` 类存在但未被使用。

**当前代码**:

```typescript
// AuthService.ts - 没有重试
const response = await this.httpClient.get(url, { timeout: 10000 });

// RetryPolicy.ts 存在但未使用
export class RetryPolicy {
  async execute<T>(fn: () => Promise<T>): Promise<T> { ... }
}
```

**修复建议**:

```typescript
import { RetryPolicy } from './RetryPolicy';

export class AuthService {
  private retryPolicy = new RetryPolicy({
    maxRetries: 3,
    delay: 1000,
    backoffMultiplier: 2,
    retryCondition: (error) => {
      // 只对网络错误重试
      return error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT';
    },
  });

  async login(config: LoginConfig): Promise<LoginResult> {
    return this.retryPolicy.execute(async () => {
      const response = await this.httpClient.get(url, { timeout: 10000 });
      return this.parseLoginResponse(response);
    });
  }
}
```

---

### P1-009: useEffect 内存泄漏风险

**位置**:

- `apps/desktop/src/components/ThemeToggle.tsx:153-175`
- `apps/mobile/src/hooks/useHeartbeat.ts:122-124`
- `apps/mobile/src/hooks/useNetwork.ts:99-111`

**问题描述**:
多个 `useEffect` 中创建了 `setInterval`，但清理逻辑不完善，可能导致内存泄漏。

**当前代码**:

```typescript
// ThemeToggle.tsx
useEffect(() => {
  const intervalId = setInterval(() => { ... }, 1000);
  // cleanup 中 intervalRef.current 可能已经改变
  return () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  };
}, []);
```

**修复建议**:

```typescript
useEffect(() => {
  const intervalId = setInterval(() => {
    // ...
  }, 1000);

  // 直接使用局部变量，确保清理正确的 interval
  return () => {
    clearInterval(intervalId);
  };
}, []);
```

---

### P1-010: 状态竞争条件

**位置**: `apps/desktop/src/hooks/useAccounts.ts:74-78`

**问题描述**:
删除账号时先更新本地状态，再调用 API，如果 API 失败，状态会不一致。

**当前代码**:

```typescript
const removeAccount = async (id: string) => {
  // 先更新状态
  setAccounts(accounts.filter((acc) => acc.id !== id));
  // 再调用 API（如果失败，状态已经改变）
  await window.electron.accounts.remove(id);
};
```

**修复建议**:

```typescript
const removeAccount = async (id: string) => {
  const previousAccounts = accounts;

  // 乐观更新
  setAccounts(accounts.filter((acc) => acc.id !== id));

  try {
    await window.electron.accounts.remove(id);
  } catch (error) {
    // 回滚状态
    setAccounts(previousAccounts);
    throw error;
  }
};
```

---

### P1-011: 托盘登录与主窗口登录并发冲突

**位置**: `apps/desktop/electron/main.ts:262-317`

**问题描述**:
用户可以同时从托盘菜单和主窗口触发登录，导致并发请求和状态混乱。

**修复建议**:

```typescript
// 添加登录锁
let isLoginInProgress = false;

async function performLogin(): Promise<LoginResult> {
  if (isLoginInProgress) {
    throw new Error('登录正在进行中');
  }

  isLoginInProgress = true;
  try {
    // 执行登录...
    return result;
  } finally {
    isLoginInProgress = false;
  }
}

// 托盘和 IPC 都使用同一个函数
trayLogin = () => performLogin();
ipcMain.handle('auth:login', () => performLogin());
```

---

### P1-012: Android Manifest 权限声明不完整

**位置**: `apps/mobile/android/app/src/main/AndroidManifest.xml:3-11`

**问题描述**:
权限声明缺少 `<uses-feature>` 标签，且 `FOREGROUND_SERVICE` 需要指定类型（Android 14+）。

**修复建议**:

```xml
<manifest>
  <!-- 权限声明 -->
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
  <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
  <uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

  <!-- Android 14+ 需要指定前台服务类型 -->
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

  <!-- 功能声明 -->
  <uses-feature android:name="android.hardware.wifi" android:required="true" />
  <uses-feature android:name="android.hardware.location" android:required="false" />

  <application>
    <service
      android:name=".service.BackgroundService"
      android:foregroundServiceType="dataSync"
      android:exported="false" />
  </application>
</manifest>
```

---

## P2 - 中优先级

### P2-001: 同步文件操作阻塞主线程

**位置**: `apps/desktop/electron/services/store.ts:42-44, 62-64`

**问题描述**:
使用同步文件 I/O 会阻塞 Electron 主进程。

**当前代码**:

```typescript
if (fs.existsSync(filePath)) {
  const content = fs.readFileSync(filePath, 'utf-8');
}
fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2), 'utf-8');
```

**修复建议**:

```typescript
import { promises as fs } from 'fs';

async loadFromFile(): Promise<void> {
  try {
    const exists = await fs.access(this.filePath).then(() => true).catch(() => false);
    if (exists) {
      const content = await fs.readFile(this.filePath, 'utf-8');
      this.data = JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

async saveToFile(): Promise<void> {
  try {
    await fs.writeFile(
      this.filePath,
      JSON.stringify(this.data, null, 2),
      'utf-8'
    );
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}
```

---

### P2-002: 每次更改都完整保存配置文件

**位置**: `apps/desktop/electron/services/store.ts:131`

**问题描述**:
每次调用 `set()` 都会写入整个配置文件，频繁操作时性能较差。

**修复建议**:

```typescript
class ElectronStore {
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private pendingChanges = false;

  async set<T>(key: string, value: T): Promise<void> {
    this.data[key] = value;
    this.pendingChanges = true;
    this.debouncedSave();
  }

  private debouncedSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      if (this.pendingChanges) {
        await this.saveToFile();
        this.pendingChanges = false;
      }
    }, 500); // 500ms 防抖
  }

  // 确保应用退出前保存
  async flush(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    if (this.pendingChanges) {
      await this.saveToFile();
      this.pendingChanges = false;
    }
  }
}
```

---

### P2-003: 日志存储性能问题

**位置**: `packages/shared/src/models/Logger.ts:57-63`

**问题描述**:
使用 `unshift()` 和 `slice()` 创建新数组，每条日志 O(n) 复杂度。

**当前代码**:

```typescript
private addLog(entry: LogEntry): void {
  this.logs.unshift(entry);  // O(n)
  if (this.logs.length > this.maxLogs) {
    this.logs = this.logs.slice(0, this.maxLogs);  // O(n)
  }
}
```

**修复建议**:

```typescript
// 方案1: 使用 push + reverse（读取时）
private addLog(entry: LogEntry): void {
  this.logs.push(entry);  // O(1)
  if (this.logs.length > this.maxLogs) {
    // 移除最旧的日志
    this.logs.shift();  // 或使用固定大小的环形缓冲区
  }
}

getLogs(): LogEntry[] {
  return [...this.logs].reverse();  // 返回时反转
}

// 方案2: 使用环形缓冲区
class CircularBuffer<T> {
  private buffer: T[];
  private head = 0;
  private size = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  toArray(): T[] {
    // 返回按时间顺序的数组
  }
}
```

---

### P2-004: 使用已废弃的 API

**位置**:

- `apps/mobile/android/.../WifiModule.kt:48-49` - `connectionInfo`
- `apps/mobile/src/context/AppContext.tsx:142` - `substr()`

**问题描述**:
使用已废弃的 API，未来版本可能不兼容。

**修复建议**:

```kotlin
// Android - 使用新的 NetworkCallback API
private fun getCurrentWifiInfo(): WifiInfo? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        // Android 12+ 使用 ConnectivityManager
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE)
            as ConnectivityManager
        val network = connectivityManager.activeNetwork
        val capabilities = connectivityManager.getNetworkCapabilities(network)
        // ...
    } else {
        @Suppress("DEPRECATION")
        return wifiManager.connectionInfo
    }
}
```

```typescript
// JavaScript - 使用 substring() 替代 substr()
// Before
id: Math.random().toString(36).substr(2, 9),

// After
id: Math.random().toString(36).substring(2, 11),

// 或使用 uuid 库
import { v4 as uuidv4 } from 'uuid';
id: uuidv4(),
```

---

### P2-005: 使用 alert() 而非 UI 组件

**位置**: `apps/desktop/src/pages/Settings.tsx:98`

**问题描述**:
使用浏览器原生 `alert()` 不符合应用设计风格。

**修复建议**:

```typescript
// 使用 Toast 或 Modal 组件
import { toast } from 'react-hot-toast';
// 或自定义 Toast 组件

// Before
alert('需要认证的 WiFi 必须选择关联账号');

// After
toast.error('需要认证的 WiFi 必须选择关联账号');

// 或使用状态管理显示错误
const [error, setError] = useState<string | null>(null);
setError('需要认证的 WiFi 必须选择关联账号');

// 在 JSX 中
{error && <div className="error-toast">{error}</div>}
```

---

### P2-006: 内联样式过多

**位置**:

- `apps/desktop/src/pages/Home.tsx`
- `apps/desktop/src/pages/Settings.tsx`
- `apps/desktop/src/pages/Logs.tsx`

**问题描述**:
大量使用内联样式，难以维护和主题化。

**修复建议**:

```typescript
// Before
<div style={{
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap'
}}>

// After - 使用 CSS 类
// styles/components.css
.card-grid {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

// Component
<div className="card-grid">

// 或使用 CSS-in-JS (styled-components / emotion)
const CardGrid = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;
```

---

### P2-007: 版本号未设置

**位置**: `apps/desktop/package.json:4`

**问题描述**:
桌面应用版本号为 `0.0.0`，影响自动更新功能。

**修复建议**:

```json
{
  "name": "netmate-desktop",
  "version": "1.0.0",
  "description": "Campus Network Auto Login Tool"
}
```

建议使用语义化版本，并在 CI/CD 中自动更新。

---

### P2-009: 组件缺少 useMemo/useCallback 优化

**位置**:

- `apps/desktop/src/pages/Settings.tsx:56-141`
- `apps/desktop/src/pages/Home.tsx:26-52`
- `apps/desktop/src/context/AppContext.tsx:80-87`

**问题描述**:
函数和计算结果在每次渲染时都重新创建，导致不必要的子组件重渲染。

**当前代码**:

```typescript
// Settings.tsx - 每次渲染都创建新函数
const handleAddAccount = async () => { ... };
const handleAddWifi = async () => { ... };
const getISPLabel = (isp: ISPType) => { ... };

// AppContext.tsx - 每次渲染都重新计算
const formattedLogs = logs.map(log => ({
  ...log,
  formattedTime: new Date(log.timestamp).toLocaleString()
}));
```

**修复建议**:

```typescript
// 使用 useCallback 包裹事件处理函数
const handleAddAccount = useCallback(async () => {
  // ...
}, [dependencies]);

const handleAddWifi = useCallback(async () => {
  // ...
}, [dependencies]);

// 使用 useMemo 缓存计算结果
const formattedLogs = useMemo(
  () =>
    logs.map((log) => ({
      ...log,
      formattedTime: new Date(log.timestamp).toLocaleString(),
    })),
  [logs]
);

// 将纯函数移到组件外部
const getISPLabel = (isp: ISPType): string => {
  const labels = { campus: '校园网', cmcc: '移动', cucc: '联通', ctcc: '电信' };
  return labels[isp] || isp;
};
```

---

### P2-010: 渲染器进程使用 any 类型

**位置**: `apps/desktop/src/vite-env.d.ts:5-8`

**问题描述**:
Electron API 类型声明使用 `any`，失去了类型安全。

**当前代码**:

```typescript
interface Window {
  electron: {
    config: {
      get: () => Promise<any>;
      set: (config: any) => Promise<void>;
    };
    // ...
  };
}
```

**修复建议**:

```typescript
import type { AppConfig, AccountConfig, WifiConfig } from '@repo/shared';

interface Window {
  electron: {
    config: {
      get: () => Promise<AppConfig>;
      set: (config: AppConfig) => Promise<void>;
    };
    accounts: {
      getAll: () => Promise<AccountConfig[]>;
      add: (account: Omit<AccountConfig, 'id'>) => Promise<AccountConfig>;
      remove: (id: string) => Promise<void>;
      setCurrent: (id: string) => Promise<void>;
    };
    wifi: {
      getAll: () => Promise<WifiConfig[]>;
      add: (wifi: Omit<WifiConfig, 'id'>) => Promise<WifiConfig>;
      remove: (id: string) => Promise<void>;
    };
    // ...
  };
}
```

---

### P2-011: 日志级别不可配置

**位置**: `packages/shared/src/models/Logger.ts:1-50`

**问题描述**:
日志级别硬编码，无法根据环境（开发/生产）调整。

**修复建议**:

```typescript
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, context?: string): void {
    if (this.level <= LogLevel.DEBUG) {
      this.addLog({ level: 'debug', message, context });
    }
  }

  info(message: string, context?: string): void {
    if (this.level <= LogLevel.INFO) {
      this.addLog({ level: 'info', message, context });
    }
  }

  // ...
}

// 使用环境变量设置级别
const logger = new Logger();
if (process.env.NODE_ENV === 'development') {
  logger.setLevel(LogLevel.DEBUG);
} else {
  logger.setLevel(LogLevel.WARN);
}
```

---

### P2-012: 移动端后台刷新耗电

**位置**: `apps/mobile/src/hooks/useNetwork.ts:99-111`

**问题描述**:
网络状态自动刷新在应用后台时仍在运行，造成不必要的电量消耗。

**修复建议**:

```typescript
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export function useNetwork() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const startPolling = () => {
      intervalRef.current = setInterval(fetchStatus, 30000);
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
        // 进入后台，停止轮询
        stopPolling();
      } else if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // 回到前台，恢复轮询
        fetchStatus();
        startPolling();
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    startPolling();

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, []);
}
```

---

### P2-013: 混合使用 console 和 Logger

**位置**:

- `apps/desktop/electron/main.ts:63, 71, 269, 270, 287...`
- `apps/mobile/src/native/WifiModule.ts:72, 127, 144...`

**问题描述**:
代码中混合使用 `console.log/warn/error` 和结构化 `Logger`，日志管理不一致。

**修复建议**:

```typescript
// 统一使用 Logger
// 不要这样
console.error('WiFi 扫描失败:', error);
console.warn('网络不可用');

// 应该这样
logger.error('WiFi 扫描失败', 'WifiModule', { error: error.message });
logger.warn('网络不可用', 'NetworkDetector');

// 在开发环境可以同时输出到控制台
class Logger {
  private addLog(entry: LogEntry): void {
    this.logs.unshift(entry);

    // 开发环境同时输出到控制台
    if (process.env.NODE_ENV === 'development') {
      const consoleFn = console[entry.level] || console.log;
      consoleFn(`[${entry.context}] ${entry.message}`);
    }
  }
}
```

---

### P2-014: TypeScript 版本不一致

**位置**:

- `package.json:35` - TypeScript 5.9.3
- `apps/mobile/package.json:48` - TypeScript 5.8.3

**问题描述**:
根目录和移动端使用不同版本的 TypeScript，可能导致类型行为不一致。

**修复建议**:

```json
// 统一在根目录管理 TypeScript 版本
// package.json (root)
{
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}

// apps/mobile/package.json - 移除 typescript，使用 workspace 版本
{
  "devDependencies": {
    // "typescript": "^5.8.3"  // 删除这行
  }
}
```

---

### P2-015: 硬编码的等待时间

**位置**: `apps/desktop/electron/main.ts:239-240`

**问题描述**:
WiFi 切换后硬编码等待 3 秒，不够灵活。

**当前代码**:

```typescript
// 等待 WiFi 连接稳定
await new Promise((resolve) => setTimeout(resolve, 3000));
```

**修复建议**:

```typescript
// 使用轮询检测代替固定等待
async function waitForWifiConnection(
  ssid: string,
  timeout = 10000,
  interval = 500
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const currentSsid = await wifiDetector.getCurrentSSID();
    if (currentSsid === ssid) {
      // 再等待一小段时间确保连接稳定
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return false;
}

// 使用
const connected = await waitForWifiConnection(targetSSID);
if (!connected) {
  throw new Error(`WiFi 连接超时: ${targetSSID}`);
}
```

---

### P2-016: 自动更新检查阻塞启动

**位置**: `apps/desktop/electron/main.ts:189-195`

**问题描述**:
应用启动 5 秒后检查更新，错误被静默忽略。

**修复建议**:

```typescript
// 异步检查更新，不阻塞主流程
async function checkForUpdatesAsync() {
  try {
    // 延迟更长时间，确保应用完全启动
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const result = await autoUpdater.checkForUpdates();
    if (result?.updateInfo) {
      services.logger.info(`发现新版本: ${result.updateInfo.version}`, 'Updater');
    }
  } catch (error) {
    // 记录错误但不影响应用运行
    services.logger.warn(`检查更新失败: ${error.message}`, 'Updater');
  }
}

// 不使用 await，让它在后台运行
checkForUpdatesAsync();
```

---

### P2-008: 缺少 CI/CD 配置

**位置**: 项目根目录

**问题描述**:
没有 `.github/workflows/` 目录，缺少自动化测试和部署。

**修复建议**:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm type-check

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm test

  build-desktop:
    needs: [lint, test]
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm build:desktop
```

---

## P3 - 低优先级

### P3-001: 缺少 iOS 支持

**位置**: `apps/mobile/src/native/WifiModule.ts:54-57`

**问题描述**:
WiFi 模块只支持 Android，iOS 返回 mock 数据。

**修复建议**:

```typescript
// iOS 实现需要使用 NetworkExtension 框架
// 但 iOS 对 WiFi 操作有严格限制

// 可行的方案：
// 1. 使用 NEHotspotConfiguration (iOS 11+)
// 2. 仅支持检测当前 WiFi，不支持切换

// native/ios/WifiModule.swift
@objc(WifiModule)
class WifiModule: NSObject {
  @objc
  func getCurrentSSID(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    if let interfaces = CNCopySupportedInterfaces() as? [String] {
      for interface in interfaces {
        if let info = CNCopyCurrentNetworkInfo(interface as CFString) as? [String: Any] {
          resolve(info["SSID"] as? String)
          return
        }
      }
    }
    resolve(nil)
  }
}
```

---

### P3-002: 加载状态过于简单

**位置**: `apps/desktop/src/pages/Settings.tsx:147-150`

**问题描述**:
加载状态只显示文字，缺少加载动画。

**修复建议**:

```typescript
// 添加骨架屏组件
const SettingsSkeleton = () => (
  <div className="settings-skeleton">
    <div className="skeleton-item" />
    <div className="skeleton-item" />
    <div className="skeleton-item" />
  </div>
);

// 或使用 Spinner
const LoadingSpinner = () => (
  <div className="loading-container">
    <div className="spinner" />
    <p>加载配置中...</p>
  </div>
);

// CSS
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

---

### P3-003: IPC 类型安全缺失

**位置**: `apps/desktop/electron/preload.ts:66-107`

**问题描述**:
使用 `unknown` 类型失去了 TypeScript 类型检查的好处。

**修复建议**:

```typescript
// 定义 IPC 类型
// types/ipc.ts
export interface IPCConfig {
  get: () => Promise<AppConfig>;
  set: (config: AppConfig) => Promise<void>;
}

export interface IPCAccounts {
  getAll: () => Promise<AccountConfig[]>;
  add: (account: AccountConfig) => Promise<AccountConfig>;
  remove: (id: string) => Promise<void>;
  setCurrent: (id: string) => Promise<void>;
}

// preload.ts
const config: IPCConfig = {
  get: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),
  set: (config: AppConfig) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, config),
};

const accounts: IPCAccounts = {
  getAll: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_GET_ALL),
  add: (account: AccountConfig) => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_ADD, account),
  // ...
};
```

---

### P3-004: 缺少 API 文档注释

**位置**: 整个 `packages/shared/src/` 目录

**问题描述**:
公开接口缺少 JSDoc 注释，不便于其他开发者使用。

**修复建议**:

````typescript
/**
 * 认证服务 - 处理校园网登录/登出
 *
 * @example
 * ```typescript
 * const authService = new AuthService('http://10.10.102.50:801');
 * const result = await authService.login({
 *   username: 'student123',
 *   password: 'password',
 *   isp: 'campus',
 *   ip: '10.0.0.1'
 * });
 * ```
 */
export class AuthService {
  /**
   * 执行登录操作
   *
   * @param config - 登录配置
   * @param config.username - 用户名（学号）
   * @param config.password - 密码
   * @param config.isp - 运营商类型
   * @param config.ip - 本机 IP 地址
   * @returns 登录结果
   * @throws {NetworkError} 网络请求失败时抛出
   */
  async login(config: LoginConfig): Promise<LoginResult> {
    // ...
  }
}
````

---

### P3-005: 未使用的参数

**位置**: `apps/desktop/electron/ipc/auth.ts:23`

**问题描述**:
`_configManager` 参数未使用，增加了不必要的复杂性。

**修复建议**:

```typescript
// 如果确实不需要，移除参数
export function registerAuthIPC(
  authService: AuthService,
  // _configManager: ConfigManager,  // 移除
  accountManager: AccountManager
  // ...
);

// 或者如果将来可能用到，保留并添加注释
export function registerAuthIPC(
  authService: AuthService,
  _configManager: ConfigManager // Reserved for future use
  // ...
);
```

---

### P3-006: Electron Builder 配置不完整

**位置**: `apps/desktop/package.json:17-32`

**问题描述**:
缺少 Linux 构建目标和代码签名配置。

**修复建议**:

```json
{
  "build": {
    "appId": "com.netmate.app",
    "productName": "NetMate",
    "directories": {
      "output": "release"
    },
    "mac": {
      "target": ["dmg", "zip"],
      "category": "public.app-category.utilities",
      "identity": "Developer ID Application: Your Name (TEAM_ID)",
      "hardenedRuntime": true,
      "notarize": {
        "teamId": "TEAM_ID"
      }
    },
    "win": {
      "target": ["nsis", "portable"],
      "certificateFile": "./cert.pfx",
      "certificatePassword": "${WIN_CERT_PASSWORD}"
    },
    "linux": {
      "target": ["AppImage", "deb", "rpm"],
      "category": "Network"
    }
  }
}
```

---

### P3-007: React 版本不一致

**位置**:

- `apps/desktop/package.json` - React 18.2.0
- `apps/mobile/package.json` - React 19.2.0

**问题描述**:
桌面端和移动端使用不同版本的 React，可能导致共享组件行为不一致。

**修复建议**:

```json
// 统一为 React 18.x (更稳定)
// apps/mobile/package.json
{
  "dependencies": {
    "react": "18.2.0",
    "react-native": "0.73.x"  // 使用兼容 React 18 的版本
  }
}

// 或统一升级到 React 19 (需要测试)
// apps/desktop/package.json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

---

### P3-008: 移动端更新器硬编码值

**位置**: `apps/mobile/src/native/AppUpdater.ts:36-44`

**问题描述**:
GitHub 用户名和版本号硬编码在代码中。

**当前代码**:

```typescript
const GITHUB_OWNER = 'your-github-username'; // 占位符
const CURRENT_VERSION = '0.0.1'; // 硬编码
```

**修复建议**:

```typescript
// 从配置或 package.json 读取
import { version } from '../../package.json';
import Config from 'react-native-config';

const GITHUB_OWNER = Config.GITHUB_OWNER || 'default-owner';
const GITHUB_REPO = Config.GITHUB_REPO || 'netmate-mobile';
const CURRENT_VERSION = version;
```

---

### P3-009: 原生模块可能为 undefined

**位置**: `apps/mobile/src/native/WifiModule.ts:48`

**问题描述**:
原生模块在某些情况下可能为 `undefined`，但代码没有防护。

**修复建议**:

```typescript
const WifiModule = NativeModules.WifiModule;

// 添加模块检查
function assertWifiModule(): void {
  if (!WifiModule) {
    throw new Error('WifiModule 原生模块不可用。' + '请确保已正确链接原生代码并重新构建应用。');
  }
}

export async function getCurrentSSID(): Promise<string | null> {
  assertWifiModule();
  // ...
}

// 或提供 Mock 实现用于开发
const WifiModuleSafe = WifiModule || {
  getCurrentSSID: async () => {
    console.warn('WifiModule not available, returning mock data');
    return 'MockWiFi';
  },
  // ...
};
```

---

### P3-010: ESLint 规则不完整

**位置**: `apps/desktop/eslint.config.js:34-40`

**问题描述**:
缺少重要的 ESLint 规则，如 `react-hooks/exhaustive-deps`。

**修复建议**:

```javascript
// eslint.config.js
export default [
  // ...existing config
  {
    rules: {
      // 现有规则
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',

      // 添加这些规则
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
    },
  },
];
```

---

### P3-011: 网络超时时间过短

**位置**: `packages/shared/src/services/NetworkDetector.ts:32-44`

**问题描述**:
连通性检查只有 5 秒超时，在网络慢时可能误判。

**修复建议**:

```typescript
// 提供可配置的超时时间
interface ConnectivityOptions {
  timeout?: number;
  retries?: number;
}

async checkConnectivity(options: ConnectivityOptions = {}): Promise<boolean> {
  const { timeout = 8000, retries = 2 } = options;

  for (let i = 0; i <= retries; i++) {
    try {
      const response = await this.httpClient.get(CHECK_URL, { timeout });
      if (response.status === 200) {
        return true;
      }
    } catch (error) {
      if (i === retries) {
        return false;
      }
      // 重试前等待
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false;
}
```

---

### P3-012: 窗口大小固定不可调整

**位置**: `apps/desktop/electron/main.ts:89-120`

**问题描述**:
窗口大小固定为 900x600，在不同屏幕尺寸上体验可能不佳。

**修复建议**:

```typescript
// 支持窗口大小调整，并记住用户偏好
const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 600;
const MIN_WIDTH = 700;
const MIN_HEIGHT = 500;

// 从配置读取上次窗口大小
const savedBounds = store.get('windowBounds') as Electron.Rectangle | undefined;

mainWindow = new BrowserWindow({
  width: savedBounds?.width || DEFAULT_WIDTH,
  height: savedBounds?.height || DEFAULT_HEIGHT,
  x: savedBounds?.x,
  y: savedBounds?.y,
  minWidth: MIN_WIDTH,
  minHeight: MIN_HEIGHT,
  resizable: true, // 允许调整大小
  // ...
});

// 保存窗口大小
mainWindow.on('close', () => {
  const bounds = mainWindow?.getBounds();
  if (bounds) {
    store.set('windowBounds', bounds);
  }
});
```

---

### P3-013: 缺少离线状态处理

**位置**: `apps/desktop/src/hooks/useNetwork.ts:25-41`

**问题描述**:
网络状态检查无法区分"完全离线"和"校园网未认证"。

**修复建议**:

```typescript
interface NetworkState {
  isOnline: boolean; // 系统网络是否可用
  isConnected: boolean; // 能否访问互联网
  isAuthenticated: boolean; // 是否通过校园网认证
  currentSSID: string | null;
  ip: string | null;
}

// 分步检测
async function getDetailedNetworkStatus(): Promise<NetworkState> {
  // 1. 检查系统网络
  const isOnline = navigator.onLine;
  if (!isOnline) {
    return {
      isOnline: false,
      isConnected: false,
      isAuthenticated: false,
      currentSSID: null,
      ip: null,
    };
  }

  // 2. 获取 WiFi 信息
  const networkInfo = await window.electron.network.getInfo();

  // 3. 检查互联网连通性
  const isConnected = await window.electron.network.checkConnectivity();

  // 4. 检查校园网认证
  const isAuthenticated = isConnected ? await window.electron.network.checkAuthentication() : false;

  return {
    isOnline,
    isConnected,
    isAuthenticated,
    currentSSID: networkInfo.ssid,
    ip: networkInfo.ipv4,
  };
}
```

---

### P3-014: 缺少组件 React.memo 优化

**位置**:

- `apps/desktop/src/components/ThemeToggle.tsx`
- `apps/desktop/src/components/Sidebar.tsx`

**问题描述**:
频繁重渲染的组件未使用 `React.memo` 优化。

**修复建议**:

```typescript
// Sidebar.tsx
import { memo } from 'react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export const Sidebar = memo(function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  // ...
});

// ThemeToggle.tsx
export const ThemeToggle = memo(function ThemeToggle() {
  // ...
});
```

---

## P4 - 长期规划

### P4-001: AppContext 过于庞大

**位置**: `apps/mobile/src/context/AppContext.tsx`

**问题描述**:
单个 400+ 行的 Context 文件处理所有状态，违反单一职责原则。

**修复建议**:

```typescript
// 拆分为多个 Context

// context/AuthContext.tsx
export const AuthContext = createContext<AuthContextValue>(null!);
export function AuthProvider({ children }: PropsWithChildren) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const login = useCallback(async () => { /* ... */ }, []);
  const logout = useCallback(async () => { /* ... */ }, []);
  return (
    <AuthContext.Provider value={{ isLoggedIn, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// context/ConfigContext.tsx
export const ConfigContext = createContext<ConfigContextValue>(null!);

// context/NetworkContext.tsx
export const NetworkContext = createContext<NetworkContextValue>(null!);

// context/LogContext.tsx
export const LogContext = createContext<LogContextValue>(null!);

// App.tsx - 组合使用
<ConfigProvider>
  <AuthProvider>
    <NetworkProvider>
      <LogProvider>
        <App />
      </LogProvider>
    </NetworkProvider>
  </AuthProvider>
</ConfigProvider>
```

---

### P4-002: 缺少依赖注入

**位置**: `apps/desktop/electron/main.ts`

**问题描述**:
服务直接创建，难以进行单元测试和替换实现。

**修复建议**:

```typescript
// 使用简单的 DI 容器
// di/container.ts
class Container {
  private services = new Map<string, unknown>();

  register<T>(key: string, factory: () => T): void {
    this.services.set(key, factory);
  }

  resolve<T>(key: string): T {
    const factory = this.services.get(key) as () => T;
    if (!factory) throw new Error(`Service ${key} not found`);
    return factory();
  }
}

export const container = new Container();

// 注册服务
container.register('storage', () => createElectronStorage());
container.register('configManager', () => {
  const storage = container.resolve<StorageAdapter>('storage');
  return createConfigManager(storage);
});

// 使用服务
const configManager = container.resolve<ConfigManager>('configManager');

// 测试时可以注册 mock
container.register('storage', () => createMockStorage());
```

---

### P4-003: 登出响应解析不完整

**位置**: `packages/shared/src/services/AuthService.ts:169-176`

**问题描述**:
登出响应解析依赖简单字符串匹配，可能不准确。

**修复建议**:

```typescript
// 完整实现登出响应解析
parseLogoutResponse(responseText: string): LogoutResult {
  try {
    // 尝试解析 JSON
    const match = responseText.match(/dr1009\((.+)\)/);
    if (match) {
      const data = JSON.parse(match[1]);
      return {
        success: data.result === 1,
        message: data.msg || (data.result === 1 ? '登出成功' : '登出失败'),
      };
    }

    // 回退：检查常见成功标识
    const successPatterns = ['result":1', '成功', 'success', 'logout'];
    const success = successPatterns.some(p =>
      responseText.toLowerCase().includes(p.toLowerCase())
    );

    return {
      success,
      message: success ? '登出成功' : '登出失败',
    };
  } catch (error) {
    return {
      success: false,
      message: '解析响应失败',
    };
  }
}
```

---

### P4-004: 硬编码服务器地址

**位置**:

- `packages/shared/src/constants/defaults.ts:3`
- `packages/shared/src/services/NetworkDetector.ts:20`

**问题描述**:
服务器地址硬编码，不同学校无法直接使用。

**修复建议**:

```typescript
// 支持多学校配置
// constants/schools.ts
export interface SchoolConfig {
  id: string;
  name: string;
  serverUrl: string;
  authCheckUrl: string;
  loginPath: string;
  logoutPath: string;
}

export const SCHOOL_CONFIGS: SchoolConfig[] = [
  {
    id: 'tust',
    name: '天津科技大学',
    serverUrl: 'http://10.10.102.50:801',
    authCheckUrl: 'http://10.10.102.50:801/eportal/portal/page/checkstatus',
    loginPath: '/eportal/portal/login',
    logoutPath: '/eportal/portal/logout',
  },
  // 可以添加更多学校...
];

// 允许用户自定义
export const CUSTOM_SCHOOL_ID = 'custom';

// UI 中添加学校选择器
<Select
  value={selectedSchool}
  onChange={handleSchoolChange}
>
  {SCHOOL_CONFIGS.map(school => (
    <Option key={school.id} value={school.id}>{school.name}</Option>
  ))}
  <Option value="custom">自定义服务器...</Option>
</Select>
```

---

### P4-005: 缺少国际化支持

**位置**: 整个项目

**问题描述**:
所有文本硬编码为中文，不支持多语言。

**修复建议**:

```typescript
// 使用 i18next
// i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n.use(initReactI18next).init({
  resources: {
    zh: {
      translation: {
        'login.title': '校园网登录',
        'login.username': '用户名',
        'login.password': '密码',
        'login.submit': '登录',
        'status.connected': '已连接',
        'status.disconnected': '未连接',
      }
    },
    en: {
      translation: {
        'login.title': 'Campus Network Login',
        'login.username': 'Username',
        'login.password': 'Password',
        'login.submit': 'Login',
        'status.connected': 'Connected',
        'status.disconnected': 'Disconnected',
      }
    }
  },
  lng: 'zh',
  fallbackLng: 'en',
});

// 组件中使用
import { useTranslation } from 'react-i18next';

function LoginForm() {
  const { t } = useTranslation();
  return (
    <form>
      <h1>{t('login.title')}</h1>
      <input placeholder={t('login.username')} />
      <input placeholder={t('login.password')} type="password" />
      <button>{t('login.submit')}</button>
    </form>
  );
}
```

---

### P4-006: 缺少无障碍支持

**位置**: 整个项目 UI 组件

**问题描述**:
缺少 ARIA 标签和键盘导航支持。

**修复建议**:

```typescript
// 添加 ARIA 标签
<button
  aria-label="登录校园网"
  aria-busy={isLoading}
  disabled={isLoading}
  onClick={handleLogin}
>
  {isLoading ? '登录中...' : '登录'}
</button>

// 添加键盘导航
<div
  role="tablist"
  aria-label="设置选项卡"
  onKeyDown={handleKeyNavigation}
>
  <button role="tab" aria-selected={activeTab === 'account'}>
    账号设置
  </button>
  <button role="tab" aria-selected={activeTab === 'wifi'}>
    WiFi 设置
  </button>
</div>

// 表单标签关联
<label htmlFor="username">用户名</label>
<input id="username" name="username" aria-describedby="username-hint" />
<span id="username-hint">请输入您的学号</span>
```

---

### P4-007: 缺少错误监控和上报

**位置**: 整个项目

**问题描述**:
没有错误监控和上报机制，无法追踪生产环境的问题。

**修复建议**:

```typescript
// 集成 Sentry 或类似服务
// utils/errorReporter.ts
import * as Sentry from '@sentry/electron';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: `netmate@${version}`,
  beforeSend(event) {
    // 过滤敏感信息
    if (event.user) {
      delete event.user.ip_address;
    }
    return event;
  },
});

export function captureException(error: Error, context?: Record<string, unknown>) {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}

// 在关键位置使用
try {
  await authService.login(config);
} catch (error) {
  captureException(error, { action: 'login', username: config.username });
  throw error;
}
```

---

### P4-008: 缺少性能监控

**位置**: 整个项目

**问题描述**:
没有性能监控，无法了解应用的实际表现。

**修复建议**:

```typescript
// 简单的性能监控
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  startTimer(name: string): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      if (!this.metrics.has(name)) {
        this.metrics.set(name, []);
      }
      this.metrics.get(name)!.push(duration);

      // 超过阈值时警告
      if (duration > 1000) {
        console.warn(`[Performance] ${name} took ${duration.toFixed(2)}ms`);
      }
    };
  }

  getStats(name: string): { avg: number; max: number; count: number } | null {
    const values = this.metrics.get(name);
    if (!values?.length) return null;

    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      max: Math.max(...values),
      count: values.length,
    };
  }
}

// 使用
const endTimer = perfMonitor.startTimer('login');
await authService.login(config);
endTimer();
```

---

### P4-009: 缺少数据库支持

**位置**: 整个项目

**问题描述**:
使用 JSON 文件存储所有数据，不适合大量数据或复杂查询。

**修复建议**:

```typescript
// 对于 Electron，使用 better-sqlite3
import Database from 'better-sqlite3';

const db = new Database('netmate.db');

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    isp TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    context TEXT,
    timestamp INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
`);

// 对于 React Native，使用 WatermelonDB 或 Realm
import { Database } from '@nozbe/watermelondb';
```

---

### P4-010: 缺少插件/扩展系统

**位置**: 整个项目

**问题描述**:
不同学校可能有不同的认证方式，但无法扩展。

**修复建议**:

```typescript
// 定义认证协议接口
interface AuthProtocol {
  name: string;
  buildLoginRequest(config: LoginConfig): {
    url: string;
    method: 'GET' | 'POST';
    body?: string;
    headers?: Record<string, string>;
  };
  parseResponse(response: string): LoginResult;
}

// 内置协议
const ePortalProtocol: AuthProtocol = {
  name: 'ePortal',
  buildLoginRequest(config) {
    // 当前实现
  },
  parseResponse(response) {
    // 当前实现
  },
};

// 注册表
const protocolRegistry = new Map<string, AuthProtocol>();
protocolRegistry.set('eportal', ePortalProtocol);

// 允许用户添加自定义协议
export function registerProtocol(protocol: AuthProtocol) {
  protocolRegistry.set(protocol.name.toLowerCase(), protocol);
}

// 使用
const protocol = protocolRegistry.get(config.protocolType);
const request = protocol.buildLoginRequest(config);
```

---

## 改进统计

| 优先级   | 数量   | 类别分布                                            |
| -------- | ------ | --------------------------------------------------- |
| P0       | 6      | 安全 (4), Bug (1), 稳定性 (1)                       |
| P1       | 12     | 安全 (1), Bug (4), 测试 (1), 代码质量 (4), 功能 (2) |
| P2       | 16     | 性能 (5), 代码质量 (7), 配置 (3), 日志 (1)          |
| P3       | 14     | 功能 (4), UX (3), 代码质量 (5), 配置 (2)            |
| P4       | 10     | 架构 (4), 功能 (4), 监控 (2)                        |
| **总计** | **58** |                                                     |

---

## 按类别统计

| 类别      | 数量 | 占比  |
| --------- | ---- | ----- |
| 代码质量  | 16   | 27.6% |
| 安全      | 5    | 8.6%  |
| 性能      | 5    | 8.6%  |
| Bug       | 5    | 8.6%  |
| 功能缺失  | 10   | 17.2% |
| 架构设计  | 7    | 12.1% |
| 配置/构建 | 5    | 8.6%  |
| UX        | 3    | 5.2%  |
| 监控/日志 | 2    | 3.5%  |

---

## 推荐修复顺序

### 第一阶段（1-2 周）：修复 P0 问题

1. P0-003: 方法名不匹配（立即修复，防止崩溃）
2. P0-005: 添加 Error Boundary（防止白屏）
3. P0-006: 启用已有的验证函数
4. P0-001: 密码 URL 传输（评估服务器是否支持 POST）
5. P0-002: 移动端密码加密
6. P0-004: HTTP 安全警告

### 第二阶段（2-4 周）：修复 P1 问题

1. P1-003: 添加单元测试（优先核心服务）
2. P1-009: 修复内存泄漏
3. P1-010: 修复状态竞争条件
4. P1-007: 添加请求取消支持
5. P1-008: 添加重试机制
6. P1-011: 修复并发登录冲突
7. P1-001: 输入验证
8. P1-002: 非空断言修复
9. P1-004: 错误处理改进
10. P1-005: NetworkDetector 逻辑修复
11. P1-006: 后台服务实现
12. P1-012: Android 权限修复

### 第三阶段（4-8 周）：修复 P2 问题

- 性能优化 (P2-001, P2-002, P2-003, P2-009, P2-012)
- 代码质量 (P2-004, P2-005, P2-006, P2-010, P2-011, P2-013)
- CI/CD 配置 (P2-008)
- 配置一致性 (P2-007, P2-014, P2-015, P2-016)

### 第四阶段（8-12 周）：修复 P3 问题

- iOS 支持评估 (P3-001)
- UX 改进 (P3-002, P3-012, P3-013)
- 代码规范 (P3-003, P3-004, P3-005, P3-010, P3-014)
- 功能增强 (P3-006, P3-008, P3-009, P3-011)

### 长期规划：P4 问题

- 架构重构 (P4-001, P4-002, P4-003)
- 多学校支持 (P4-004, P4-010)
- 国际化 (P4-005)
- 无障碍 (P4-006)
- 监控体系 (P4-007, P4-008)
- 数据存储 (P4-009)

---

_文档版本: 2.0_
_最后更新: 2026-01-02_
_作者: Claude_
_问题总数: 58 个_
