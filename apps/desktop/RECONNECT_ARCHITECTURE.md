# 重连机制架构分析

## 概览

NetMate 有两个独立的自动重连机制：

1. **WiFi 自动重连**（系统层）
2. **校园网自动重连**（应用层）

## 1. WiFi 自动重连

### 实现位置
- `electron/services/wifi-event-listener.ts`

### 触发条件
- 系统检测到 WiFi SSID 从存在变为 `null`（物理层断开）
- 每秒轮询检测 SSID 变化

### 处理流程
```
WiFi 断开 → 三阶段重连流程：
├── 阶段1: 单个 WiFi 重连（重试 N 次，每次间隔 2s）
├── 阶段2: 优先级切换（按优先级尝试其他 WiFi，间隔 1s）
└── 阶段3: 全部失败（广播失败列表，停止重连）
```

### 依赖服务
- `WifiSwitcherService`: WiFi 连接/切换
- `WifiManager`: WiFi 配置管理
- `ConfigManager`: 获取最大重试次数
- `NetworkDetector`: 获取网络状态

### 广播事件
- `event:wifi:reconnectProgress`: 重连进度
- `event:wifi:allReconnectsFailed`: 所有 WiFi 失败

### 特点
- ✅ 完全独立，不涉及校园网认证
- ✅ 基于系统层面的 WiFi 连接状态
- ✅ 自动按优先级切换备用 WiFi

---

## 2. 校园网自动重连

### 实现位置
- `electron/services/auto-reconnect.ts`

### 触发条件
- 心跳检测发现 `NetworkStatus.connected` 从 `true` 变为 `false`
- 即：WiFi 已连接，但校园网认证失效

### 处理流程
```
认证失效 → 重连流程：
└── 使用 RetryPolicy 重试登录（指数退避，最大重试 3 次）
    ├── 获取网络信息（IP/MAC）
    ├── 调用 AuthService.login() 认证
    └── 成功 → 广播成功 / 失败 → 广播失败
```

### 依赖服务
- `AuthService`: 校园网认证
- `AccountManager`: 账户管理
- `RetryPolicy`: 重试策略

### 广播事件
- `event:reconnect:progress`: 重连进度

### 特点
- ✅ 服务本身独立，只关注认证状态
- ✅ 基于应用层面的认证状态
- ⚠️ 在 `main.ts` 回调中有 WiFi 切换逻辑（耦合点）

---

## 3. 当前耦合点分析

### 问题所在：`main.ts` 的 `onReconnectFailed` 回调

```typescript
// main.ts:316-349
onReconnectFailed: async () => {
  // 校园网重连失败后，尝试切换 WiFi
  if (wifiSwitcherService && services) {
    const result = await wifiSwitcherService.switchToNextNetwork(currentWifi.ssid);
    if (result.success && result.ssid) {
      // 切换成功后，再次触发校园网重连
      setTimeout(() => {
        autoReconnectService?.triggerReconnect();
      }, 3000);
    }
  }
}
```

### 耦合问题

**当前逻辑**：
```
校园网认证失败 → 切换 WiFi → 再次尝试校园网认证
```

**问题**：
1. **职责混乱**：校园网层面的失败触发了 WiFi 层面的操作
2. **重复机制**：WiFi 重连已有完整的切换逻辑，无需在此处再次实现
3. **逻辑冲突**：可能与 WiFi 自动重连机制产生竞态条件

### 场景分析

#### 场景1：WiFi 物理断开
```
1. WiFi 断开（SSID = null）
2. wifi-event-listener 检测到 → 触发 WiFi 重连
3. WiFi 重连成功 → 触发 notifyNetworkStatusChange()
4. 获取新的 NetworkStatus（可能 connected = false）
5. 如果未认证 → auto-reconnect 检测到 → 触发校园网重连 ✅
```
**结论**：两个机制顺序协作，无冲突

#### 场景2：WiFi 连接，但校园网认证失效
```
1. WiFi 仍连接（SSID 存在）
2. 心跳检测发现 NetworkStatus.connected = false
3. auto-reconnect 触发 → 尝试校园网重连
4. 校园网重连失败 → onReconnectFailed 触发
5. ❌ 当前实现：切换 WiFi（不合理）
```
**问题**：
- 认证失败不一定是 WiFi 问题（可能是账号/密码错误、服务器问题）
- 切换 WiFi 也无法解决认证层的问题

#### 场景3：WiFi 信号差导致认证失败
```
1. WiFi 连接但信号差
2. 认证请求超时/失败
3. auto-reconnect 失败 → onReconnectFailed
4. ✅ 切换到信号更好的 WiFi（合理）
```
**这是唯一合理的场景**，但：
- WiFi 信号差 → 应该由 WiFi 层检测和处理
- 不应该由认证层来判断是否需要切换 WiFi

---

## 4. 建议的解耦方案

### 方案：移除 `onReconnectFailed` 中的 WiFi 切换逻辑

#### 修改前（main.ts:316-349）
```typescript
onReconnectFailed: async () => {
  trayService?.setStatus('disconnected');

  // ❌ 移除这部分
  if (wifiSwitcherService && services) {
    const result = await wifiSwitcherService.switchToNextNetwork(currentWifi.ssid);
    // ...
  }
}
```

#### 修改后
```typescript
onReconnectFailed: async () => {
  trayService?.setStatus('disconnected');

  // 广播重连失败事件
  win?.webContents.send('event:reconnect:progress', {
    status: 'failed',
    currentAttempt: 3,
    maxAttempts: 3,
    message: '自动重连失败',
  });

  // 显示通知
  notificationService?.showReconnectFailed();
}
```

### 理由

1. **职责分离**：
   - WiFi 层只负责 WiFi 连接
   - 认证层只负责校园网认证

2. **避免重复**：
   - WiFi 切换已由 `wifi-event-listener` 完整处理
   - 不需要在认证层再次实现

3. **逻辑清晰**：
   - 如果 WiFi 有问题 → WiFi 会自动断开 → wifi-event-listener 处理
   - 如果是认证问题 → 切换 WiFi 无济于事

4. **避免竞态**：
   - 防止两个重连机制同时操作 WiFi

---

## 5. 解耦后的完整流程

### WiFi 断开场景
```
1. WiFi 断开 (SSID: "校园网" → null)
   └─→ wifi-event-listener 检测到
       ├─→ 尝试重连"校园网"（3次）
       ├─→ 失败 → 切换到"备用WiFi"（按优先级）
       ├─→ 成功连接"备用WiFi"
       └─→ 触发 notifyNetworkStatusChange()
           └─→ 心跳检测发现未认证
               └─→ auto-reconnect 触发校园网重连 ✅
```

### 校园网认证失效场景
```
1. WiFi 连接正常（SSID: "校园网"）
2. 心跳检测发现 connected = false
   └─→ auto-reconnect 触发
       ├─→ 重试登录（3次）
       └─→ 失败
           └─→ 仅通知用户，不切换 WiFi ✅
```

### WiFi 信号差场景
```
1. WiFi 信号差
   └─→ 系统会自动断开 WiFi
       └─→ wifi-event-listener 检测到
           └─→ 尝试重连/切换 WiFi ✅
```

---

## 6. 总结

### 当前状态
- ❌ **存在耦合**：校园网重连失败时会触发 WiFi 切换
- ⚠️ **逻辑冲突**：两个重连机制可能同时操作 WiFi

### 解耦后
- ✅ **完全独立**：两个机制各司其职
- ✅ **职责清晰**：WiFi 层管 WiFi，认证层管认证
- ✅ **协作自然**：通过状态变化事件协作，无直接依赖

### 实施步骤
1. 修改 `main.ts` 的 `onReconnectFailed` 回调
2. 移除 WiFi 切换逻辑
3. 测试两个重连机制的独立运行

---

## 7. 架构图

```
┌─────────────────────────────────────────────────┐
│                   NetMate App                    │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌─────────────────┐      ┌─────────────────┐  │
│  │  WiFi 自动重连   │      │ 校园网自动重连   │  │
│  │ (WiFi Layer)    │      │ (Auth Layer)    │  │
│  └─────────────────┘      └─────────────────┘  │
│          │                         │            │
│          │ 监听 SSID 变化           │ 监听认证状态│
│          ↓                         ↓            │
│  ┌─────────────────┐      ┌─────────────────┐  │
│  │wifi-event       │      │auto-reconnect   │  │
│  │-listener        │      │.ts              │  │
│  └─────────────────┘      └─────────────────┘  │
│          │                         │            │
│          │ 操作                    │ 操作        │
│          ↓                         ↓            │
│  ┌─────────────────┐      ┌─────────────────┐  │
│  │WiFiSwitcher     │      │AuthService      │  │
│  │Service          │      │                 │  │
│  └─────────────────┘      └─────────────────┘  │
│          │                         │            │
│          └──────────┬──────────────┘            │
│                     ↓                            │
│            ┌─────────────────┐                  │
│            │NetworkDetector  │                  │
│            │(状态广播)        │                  │
│            └─────────────────┘                  │
│                                                  │
└─────────────────────────────────────────────────┘

协作方式：事件驱动，无直接依赖
```
