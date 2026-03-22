# 第五次功能检查报告

> 检查日期：2026-03-22
> 检查范围：对照 `requirements.md` 需求文档，逐行代码级审计实现情况
> 上次检查：`phase4-requirements-check.md`
> **状态：已修复 7 个 Bug，仍有 3 个待处理项**

---

## 一、检查方法

本次检查与前四次不同，采用**逐行代码级审计**方式，对照 `docs/requirements.md` 中的每一条需求，直接阅读对应的实现代码，验证：

1. 功能是否真正实现（而非仅存在文件/函数签名）
2. 实现是否与需求规格一致（参数值、颜色代码、时间间隔等）
3. 边界条件和异常路径是否正确处理
4. 不同模块之间的协作是否符合架构设计

---

## 二、发现的 Bug 及修复情况

### 2.1 已修复的 Bug

#### ✅ BUG-1（严重）：WiFi 重连失败记录遗漏

| 项目 | 内容 |
|------|------|
| **文件** | `apps/desktop/electron/services/wifi-event-listener.ts` |
| **描述** | `retryConnectToWifi()` 中，当 `connectToConfiguredNetwork()` 返回 `false`（非异常）时，不会记录到 `failedList`，也不会广播失败状态 |
| **影响** | 阶段 3 的失败列表可能缺少某些 WiFi 的记录，UI 显示不完整 |
| **根因** | 失败记录逻辑只在 `catch` 块中执行，`success === false` 的分支被遗漏 |
| **修复** | 在循环结束后 `return false` 前，使用 `.some()` 检查并补充未记录的失败信息 |

#### ✅ BUG-2（文档）：CLAUDE.md 登录协议描述不准确

| 项目 | 内容 |
|------|------|
| **文件** | `CLAUDE.md` |
| **描述** | 文档写 "HTTP POST"，实际校园网认证服务器使用 **GET + JSONP** 模式 |
| **影响** | 文档误导开发者，代码实现本身是正确的 |
| **修复** | 将 "HTTP POST" 改为 "HTTP GET (JSONP)" |

#### ✅ BUG-4（中等）：WiFi 事件监听器轮询间隔不符合需求

| 项目 | 内容 |
|------|------|
| **文件** | `apps/desktop/electron/services/wifi-event-listener.ts` |
| **需求** | §2.2.2 / §2.5.1 要求 "检测间隔 1 秒" |
| **实际** | 默认值为 `3000ms`（3 秒） |
| **影响** | WiFi 断开检测延迟增加 2 秒 |
| **修复** | 默认值从 `3000` 改为 `1000`，同步更新注释 |

#### ✅ BUG-5（中等）：maxRetries 最小值不符合需求

| 项目 | 内容 |
|------|------|
| **文件** | `apps/desktop/src/pages/Settings.tsx` |
| **需求** | §2.5.3 要求 "可配置范围：1-10 次" |
| **实际** | `min={0}`，允许设置为 0（等于禁用重连但无 UI 说明） |
| **修复** | 将 `min={0}` 改为 `min={1}` |

#### ✅ BUG-6（中等）：自动重连未校验 linkedAccountId

| 项目 | 内容 |
|------|------|
| **文件** | `apps/desktop/electron/services/auto-reconnect.ts` + `apps/desktop/electron/main.ts` |
| **需求** | §2.4.4 要求校园网重连使用 WiFi 关联的账号 |
| **实际** | 只获取 `accountManager.getCurrentAccount()`，忽略了 `linkedAccountId` |
| **影响** | 多账号+多 WiFi 场景下可能使用错误的账号进行重连 |
| **修复** | 添加 `WifiManager` 依赖，优先通过 `linkedAccountId` 查找关联账号，回退到全局当前账号 |

#### ✅ BUG-7（中等）：重连第一次尝试没有等待间隔

| 项目 | 内容 |
|------|------|
| **文件** | `apps/desktop/electron/services/wifi-event-listener.ts` |
| **需求** | §2.5.2 阶段 1 要求 "等待固定间隔后重试" |
| **实际** | `if (attempt > 1)` 条件导致第一次尝试立即执行 |
| **影响** | WiFi 刚断开时硬件未完全重置，立即连接大概率失败 |
| **修复** | 在重连流程开始前添加 2 秒硬件重置等待 |

#### ✅ BUG-9 + BUG-10（轻微）：频段显示颜色和格式

| 项目 | 内容 |
|------|------|
| **文件** | `apps/desktop/src/pages/Home.tsx` |
| **需求** | §2.6.4 要求 5GHz 显示为 "5G"（绿色），2.4GHz 显示为 "2.4G"（蓝色） |
| **实际** | 显示为 "5GHz"/"2.4GHz"，使用固定 `var(--primary-color)` 无颜色区分 |
| **修复** | 格式改为 "5G"/"2.4G"，颜色按需求规格实现（含深色模式适配） |

---

### 2.2 未修复的问题

#### ❌ BUG-3（严重）：移动端 WiFi `connect`/`disconnect`/`scan` 未实现

| 项目 | 内容 |
|------|------|
| **文件** | `apps/mobile/src/services/MobileWifiAdapter.ts` (Line 141-159) |
| **需求** | §2.2.2 WiFi 自动重连、§2.5 三阶段重连流程 |
| **实际** | 三个关键方法都是 stub，只打印 `console.warn` 并返回 `false`/`[]` |
| **影响** | Android 端的 WiFi 自动重连和优先级切换功能**完全不工作** |
| **原因** | 需要 Android 原生开发（Kotlin），涉及系统级 WiFi API 调用和权限管理 |

#### ⚠️ BUG-8（低优先级）：macOS `airport` 命令路径硬编码

| 项目 | 内容 |
|------|------|
| **文件** | `apps/desktop/electron/services/wifi-event-listener.ts` (Line 423) |
| **描述** | 使用硬编码路径调用 `airport -I`，macOS Ventura/Sonoma+ 可能已废弃 |
| **缓解** | 代码已有 `networksetup` 作为备用方案，但仅检测 `en0` 接口 |

#### ❌ 移动端类型错误（预先存在）

| 项目 | 内容 |
|------|------|
| **文件** | `apps/mobile/src/` 多个文件 |
| **描述** | `StorageAdapter` 缺少 `clear`/`keys`、`AccountManager` 缺少 `setCurrentAccount`、`RetryPolicy` 接口不匹配等 20+ 个类型错误 |
| **说明** | 这些是第四次检查前就存在的问题，与本次修复无关 |

---

## 三、需求对照清单

### 3.1 账户管理（§2.1）✅ 已完成

| 需求项 | 状态 | 验证文件 |
|--------|:----:|----------|
| 多账户支持（增删切换） | ✅ | `Settings.tsx` |
| 服务商选择 (campus/cmcc/cucc/ctcc) | ✅ | `ISP_OPTIONS` 定义 |
| 服务器地址配置（默认 `http://10.10.102.50:801`） | ✅ | `Settings.tsx` 默认值 |

### 3.2 WiFi 配置（§2.2）✅ 已完成

| 需求项 | 状态 | 验证文件 |
|--------|:----:|----------|
| 多 WiFi 支持（增删查看） | ✅ | `Settings.tsx` |
| WiFi 认证类型切换 (`requiresAuth`) | ✅ | `Settings.tsx` toggle |
| WiFi 关联账号 (`linkedAccountId`) | ✅ | `Settings.tsx` 选择器 |
| WiFi 优先级 (1-99) | ✅ | 数值输入框 |
| 优先级颜色标识 | ✅ | `getPriorityColor()` 匹配需求规格 |
| `onWheel blur` 防滚轮 | ✅ | 优先级/间隔输入已处理 |
| WiFi 自动重连（三阶段） | ✅ | `wifi-event-listener.ts`（已修复 BUG-1/4/7） |
| `autoConnect` 独立开关 | ✅ | 每个 WiFi 独立配置 |
| 重连进度卡片 | ✅ | `WifiReconnectProgressCard` |
| 重连失败卡片 | ✅ | `WifiReconnectFailedCard` |

### 3.3 登录认证（§2.3）✅ 已完成

| 需求项 | 状态 | 验证文件 |
|--------|:----:|----------|
| 手动登录 | ✅ | `auth.ts` IPC handler |
| 手动登出 | ✅ | `auth.ts` IPC handler |
| 自动登录（连接 WiFi 后触发） | ✅ | `auto-reconnect.ts` |
| 登录协议（GET + JSONP） | ✅ | `AuthService.ts`，已更新 CLAUDE.md |

### 3.4 心跳检测（§2.4）✅ 已完成

| 需求项 | 状态 | 验证文件 |
|--------|:----:|----------|
| 心跳开关（默认关闭） | ✅ | `Settings.tsx` |
| 检测间隔配置（默认 30s，最小 5s） | ✅ | `Settings.tsx` |
| 检测目标（百度/测速网/华为云） | ✅ | `NetworkDetector.ts` |
| 断线重连（认证层，指数退避） | ✅ | `auto-reconnect.ts`（已修复 BUG-6） |
| 重试策略（最大 3 次，指数退避） | ✅ | `RetryPolicy` |

### 3.5 WiFi 自动重连详细流程（§2.5）✅ 已修复

| 需求项 | 状态 | 说明 |
|--------|:----:|------|
| 触发条件（1 秒检测） | ✅ | 已从 3s 修复为 1s |
| 阶段 1：单个 WiFi 重连 | ✅ | 已添加初始等待 |
| 阶段 2：优先级切换（1s 等待） | ✅ | 按优先级排序正确 |
| 阶段 3：所有失败（广播失败列表） | ✅ | 已修复失败记录遗漏 |
| maxRetries 配置（1-10） | ✅ | 已修复最小值为 1 |

### 3.6 状态显示（§2.6）✅ 基本完成

| 需求项 | 状态 | 说明 |
|--------|:----:|------|
| 启动时 WiFi 检测 | ✅ | `main.ts` 初始化获取 |
| 4 级优先级显示逻辑 | ✅ | Home.tsx 实现正确 |
| 信号强度（%，4 级颜色） | ✅ | `getSignalIcon` 匹配需求 |
| 网络延迟（ms，6 级颜色） | ✅ | `getLatencyStatus` 匹配需求 |
| 连接速度（Mbps，5 级颜色） | ✅ | `getLinkSpeedStatus` 匹配需求 |
| 频段显示（5G/2.4G，颜色区分） | ✅ | 已修复颜色和格式 |
| 手动刷新（2s 节流） | ✅ | `RefreshCw` 按钮 |
| 扩展信息（IPv4/IPv6/MAC/网关/DNS 等） | ✅ | Home.tsx 展示 |
| 深色模式支持 | ✅ | `isDarkMode()` 双色方案 |

### 3.7 日志记录（§2.7）✅ 已完成

| 需求项 | 状态 |
|--------|:----:|
| 5 级日志（debug/info/success/warn/error） | ✅ |
| 按时间倒序显示 | ✅ |
| 按级别筛选 | ✅ |
| 显示筛选后数量 | ✅ |
| 清除日志 | ✅ |

### 3.8 通知（§2.8）✅ 已完成

| 需求项 | 状态 |
|--------|:----:|
| 系统通知（WiFi 断开/重连/登录成功/失败等） | ✅ |
| 通知开关（默认开启） | ✅ |

### 3.9 系统集成（§2.9）✅ 已完成

| 需求项 | 桌面端 | 移动端 |
|--------|:------:|:------:|
| 开机自启 | ✅ | ✅ |
| 系统托盘 | ✅ | — |
| 后台服务 | ✅（托盘） | ✅（前台服务） |

### 3.10 自动更新（§2.10）✅ 已完成

| 需求项 | 状态 | 实现方式 |
|--------|:----:|----------|
| 桌面端更新 | ✅ | electron-updater |
| 移动端更新 | ✅ | APK 下载安装 |

### 3.11 非功能需求（§3）

| 需求项 | 状态 | 说明 |
|--------|:----:|------|
| 密码加密存储 | ⚠️ | 桌面端 electron-store（明文 JSON），移动端 AsyncStorage（非加密） |
| 日志中不记录密码 | ✅ | AuthService 日志仅记录用户名 |
| 界面中文 | ✅ | |
| lucide-react 图标 | ✅ | |
| 单元测试 | ❌ | 完全缺失 |

### 3.12 页面结构（§4）

| 页面 | 状态 | 说明 |
|------|:----:|------|
| 运行状态（Home） | ✅ | |
| 配置设置（Settings） | ✅ | |
| 运行日志（Logs） | ✅ | |
| 关于 | ❌ | 需求列出但未实现 |

---

## 四、修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `apps/desktop/electron/services/wifi-event-listener.ts` | Fix-1: 补充失败记录；Fix-4: 间隔 1s；Fix-7: 初始等待 |
| `apps/desktop/electron/services/auto-reconnect.ts` | Fix-6: 添加 WifiManager 依赖，使用 linkedAccountId |
| `apps/desktop/electron/main.ts` | Fix-6: 传递 wifiManager 参数 |
| `apps/desktop/src/pages/Settings.tsx` | Fix-5: maxRetries min=1 |
| `apps/desktop/src/pages/Home.tsx` | Fix-8/9: 频段颜色+格式 |
| `CLAUDE.md` | Fix-2: 登录协议描述更正 |

---

## 五、验证结果

| 验证项 | 结果 |
|--------|:----:|
| Desktop 类型检查 (`pnpm -C apps/desktop type-check`) | ✅ 通过 |
| Shared 包类型检查 (`pnpm -C packages/shared type-check`) | ✅ 通过 |
| Desktop Lint (`pnpm -C apps/desktop lint`) | ✅ 通过 |
| 代码审查（自动） | ✅ 7/7 全部通过 |
| 移动端类型检查 | ❌ 20+ 预先存在的错误（与本次修改无关） |

---

## 六、完成度统计

| 分类 | 数量 | 说明 |
|------|:----:|------|
| ✅ 已修复 Bug | 7 | BUG-1/2/4/5/6/7/9+10 |
| ❌ 未修复（严重） | 1 | BUG-3：移动端 WiFi 控制未实现 |
| ⚠️ 未修复（低优先级） | 1 | BUG-8：macOS airport 路径（有备用方案） |
| ❌ 缺失功能 | 2 | "关于"页面、密码加密存储 |
| ❌ 待补充 | 1 | 单元测试 |

---

## 七、后续工作建议

### P0（阻塞发布）

1. **移动端 WiFi 控制实现**（BUG-3）
   - 在 `WifiModule.kt` 中实现 `connectToWifi(ssid, password)`、`disconnectWifi()`、`scanWifi()`
   - 桥接到 `MobileWifiAdapter.ts`
   - 处理 Android 8.0+ 位置权限要求

2. **移动端类型错误修复**
   - `StorageAdapter` 接口缺少 `clear`/`keys` 方法
   - `AccountManager` 缺少 `setCurrentAccount` 方法
   - `RetryPolicy` 接口不匹配

### P1（建议修复）

3. **密码加密存储**（§3.1）
   - 桌面端：使用 Electron `safeStorage` API
   - 移动端：使用 `react-native-keychain`

4. **添加"关于"页面**（§4.1）
   - 显示版本号、更新检查、项目链接

5. **单元测试**
   - 优先覆盖 `AuthService`、`RetryPolicy`、`WifiManager` 等核心服务

### P2（可选优化）

6. **macOS WiFi 检测**（BUG-8）
   - 添加 `wdutil` 命令作为额外备用方案（macOS Sonoma+）
   - 或使用 `CoreWLAN` 框架通过 Node native addon

---

## 八、参考文档

| 文档 | 说明 |
|------|------|
| `docs/requirements.md` | 需求文档 |
| `docs/phase4-requirements-check.md` | 第四阶段检查 |
| `apps/desktop/RECONNECT_ARCHITECTURE.md` | 双重连机制架构 |
| `CLAUDE.md` | 项目概述（已更新登录协议描述） |
| `AGENTS.md` | AI 代理操作规范 |
