# 桌面端 WiFi 信息获取技术文档

## 概述

本文档详细说明了 NetMate 桌面端（Electron）如何获取 WiFi 连接信息，包括遇到的技术挑战和解决方案。

## 技术架构

### 整体流程

```
NetworkDetector (shared)
    ↓
DesktopWifiAdapter (desktop/electron/services)
    ↓
系统命令执行 (execAsync)
    ↓
Windows: netsh / ipconfig
macOS: airport / scutil
```

### 核心文件

- `packages/shared/src/services/NetworkDetector.ts` - 跨平台网络检测服务
- `apps/desktop/electron/services/wifi-adapter.ts` - 桌面端 WiFi 适配器实现

## 平台差异

### Windows 平台

**获取 WiFi 基本信息**：
```powershell
chcp 65001 >nul && netsh wlan show interfaces
```

**获取网络配置**：
```powershell
chcp 65001 >nul && ipconfig /all
```

### macOS 平台

**获取 WiFi 基本信息**：
```bash
/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I
```

**获取网络配置**：
- 使用 Node.js `os.networkInterfaces()` API
- `netstat -nr` 获取网关
- `scutil --dns` 获取 DNS 服务器

## 遇到的问题与解决方案

### 问题 1：Windows 字符编码问题

#### 问题描述
Windows 系统默认使用 GBK/GB2312 编码输出中文，导致：
- SSID 中文名称显示为乱码：`绗ㄨ泲鎬绘槸娴佺溂娉?`
- 字段名称无法识别（如"信号"、"接收速率"等）

#### 根本原因
1. Windows 命令行默认编码不是 UTF-8
2. 不同语言环境下，`netsh` 输出的字段名称不同（中文 vs 英文）
3. SSID 存储使用系统默认编码（GBK），但输出编码可能已切换为 UTF-8

#### 解决方案

**步骤 1：使用 `chcp 65001` 切换到 UTF-8 编码**
```typescript
const { stdout } = await execAsync('chcp 65001 >nul && netsh wlan show interfaces', {
  encoding: 'buffer',
});
const output = stdout.toString('utf8');
```

- `chcp 65001` 将代码页切换到 UTF-8
- `>nul` 隐藏 chcp 命令的输出
- 使用 `encoding: 'buffer'` 获取原始字节流，手动解码为 UTF-8

**步骤 2：支持中英文双语字段名**
```typescript
const data: Record<string, string> = {};

// 信号强度（支持中英文）
const signalStr = data['signal'] || data['信号'] || '0%';

// 连接速度（支持中英文，包含单位后缀）
const receiveRateStr = data['receive rate'] || data['receive rate (mbps)'] || data['接收速率'] || '0';
```

**步骤 3：SSID 乱码检测与 GBK 降级处理**
```typescript
const ssid = data['ssid'] || data['名称'] || '';
let finalSsid = ssid;

// 检测 SSID 是否为乱码
if (!ssid || ssid.includes('�') || /[\x00-\x1F\x7F]/.test(ssid)) {
  console.log('[WiFiAdapter] SSID seems corrupted, trying alternative method...');
  try {
    // 使用 GBK 编码重新获取 SSID
    const { stdout: rawOutput } = await execAsync('netsh wlan show interfaces', {
      encoding: 'buffer',
    });
    const gbkOutput = rawOutput.toString('gbk');
    const ssidMatch = gbkOutput.match(/^\s*SSID\s*:\s*(.+)$/m);
    if (ssidMatch && ssidMatch[1]) {
      finalSsid = ssidMatch[1].trim();
    }
  } catch (err) {
    console.error('[WiFiAdapter] Failed to get SSID with GBK encoding:', err);
  }
}
```

**原理**：
- 先用 UTF-8 解码获取英文字段名（方便解析）
- 检测 SSID 是否包含替换字符 `�` 或控制字符
- 如果检测到乱码，重新执行命令并用 GBK 解码获取正确的 SSID

### 问题 2：Windows CRLF 行尾符导致正则匹配失败

#### 问题描述
Windows 命令输出使用 `\r\n`（CRLF）作为行尾符，导致：
```
Line 3: "    Name                   : WLAN\r" (length: 34)
```
行尾的 `\r` 字符使正则表达式 `/^([^:]+?)\s*:\s*(.+)$/` 无法匹配

#### 解决方案

**步骤 1：使用支持 CRLF 的分割模式**
```typescript
// 使用正则分割行，同时处理 \r\n 和 \n
const lines = output.split(/\r?\n/);
```

**步骤 2：解析前去除首尾空白**
```typescript
for (const line of lines) {
  const trimmedLine = line.trim();  // 移除 \r、\n 和空格

  const match = trimmedLine.match(/^([^:]+?)\s*:\s*(.+)$/);
  if (match) {
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    data[key] = value;
  }
}
```

### 问题 3：字段名称包含单位后缀

#### 问题描述
某些 Windows 系统输出的字段名称包含单位：
- `Receive rate (Mbps)` 而非 `Receive rate`
- `Transmit rate (Mbps)` 而非 `Transmit rate`

导致字段匹配失败，连接速度显示为 0 Mbps。

#### 解决方案
```typescript
// 同时匹配带单位和不带单位的字段名
const receiveRateStr = data['receive rate'] || data['receive rate (mbps)'] || data['接收速率'] || '0';
const transmitRateStr = data['transmit rate'] || data['transmit rate (mbps)'] || data['传输速率'] || '0';
```

### 问题 4：网络延迟测试策略

#### 问题描述
需要测量实际网络延迟，但存在以下挑战：
1. 不同网络环境下最佳测试目标不同
2. 国外服务（如 Google）在国内访问慢或被墙
3. 需要提供可靠的降级方案

#### 当前解决方案（v1.0）

**测试策略**：优先百度，降级到测速网

```typescript
async measureLatency(): Promise<LatencyResult> {
  // 第一选择：百度
  const baiduResult = await this.testSingleTarget('https://www.baidu.com', '百度');
  if (baiduResult.status !== 'timeout') return baiduResult;

  // 备用：测速网
  const speedtestResult = await this.testSingleTarget('https://www.speedtest.cn', '测速网');
  if (speedtestResult.status !== 'timeout') return speedtestResult;

  // 都失败，返回超时
  return { value: 9999, status: 'timeout', source: '百度', ... };
}
```

**测试目标**：
1. 🥇 **百度** (`https://www.baidu.com`) - 第一选择
   - 国内访问速度快
   - CDN 覆盖全国
   - 可靠性高

2. 🥈 **测速网** (`https://www.speedtest.cn`) - 备用
   - 专业测速服务
   - 多节点部署
   - 适合延迟测量

**数据来源标识**：
- 界面显示延迟数据时会标注来源："网络延迟 (百度)" 或 "(测速网)"
- `LatencyResult.source` 字段记录数据来源

#### 未来改进计划（v2.0）

**计划功能**：
1. **多服务商支持**
   - 添加更多国内优质测速节点（阿里云、腾讯云、华为云等）
   - 根据地理位置智能选择最优节点

2. **用户自定义测速目标**
   - 允许用户在设置中添加自定义测速 URL
   - 支持多个目标并发测试，取最优结果
   - 保存常用测速目标列表

3. **智能选择策略**
   - 记录历史测速数据，学习最快的服务
   - 根据网络环境（校园网/家庭网/移动网）自动切换
   - 支持按优先级排序测试目标

**配置示例（未来）**：
```typescript
interface LatencyConfig {
  targets: Array<{
    url: string;
    name: string;
    priority: number;
    enabled: boolean;
  }>;
  strategy: 'fastest' | 'sequential' | 'parallel';
  timeout: number;
}
```

### 问题 5：WiFi 详细信息未包含延迟数据

#### 问题描述
界面显示 WiFi 信息时，延迟字段始终为空或超时。

#### 根本原因
`NetworkDetector.getCurrentWifiStatus()` 直接调用了 `wifiAdapter.getWifiDetails()`，绕过了延迟测试逻辑。

#### 解决方案
```typescript
// 修改前
const wifiDetails = await this.wifiAdapter.getWifiDetails();

// 修改后
const wifiDetails = await this.getWifiDetails();
```

`this.getWifiDetails()` 方法会检查延迟数据是否存在，如不存在则自动调用 `measureLatency()` 进行测试。

## 数据流程

### 完整数据获取流程

1. **触发检测**
   - 定时轮询（默认 30 秒，可配置为 5 分钟）
   - 手动刷新按钮

2. **获取 WiFi 基本信息**
   - Windows: 执行 `chcp 65001 >nul && netsh wlan show interfaces`
   - macOS: 执行 `airport -I`
   - 解析输出获取：SSID、信号强度、连接速度、频段、信道、BSSID、安全类型

3. **获取网络配置信息**
   - Windows: 执行 `chcp 65001 >nul && ipconfig /all`
   - macOS: 使用 `os.networkInterfaces()` + 系统命令
   - 解析获取：IPv4、IPv6、MAC、网关、DNS、子网掩码

4. **测试网络延迟**
   - 优先测试百度 `https://www.baidu.com`
   - 失败则降级到测速网 `https://www.speedtest.cn`
   - 记录响应时间、数据来源并评级（优秀/良好/一般/较差/很差）

5. **合并数据**
   - `NetworkDetector.getWifiDetails()` 合并所有数据
   - 返回完整的 `WifiDetails` 对象

6. **传递到 UI**
   - Electron Main Process → IPC → Renderer Process
   - React 组件通过 `window.electronAPI.network.getFullInfo()` 获取数据

## 性能优化

### 编码转换策略

1. **主命令使用 UTF-8**：获取结构化数据（字段名为英文）
2. **降级使用 GBK**：仅当检测到 SSID 乱码时
3. **避免重复执行**：缓存结果，减少系统命令调用

### 错误处理

所有系统命令执行都包含 try-catch 块：
```typescript
try {
  const { stdout } = await execAsync(...);
  // 处理输出
} catch (error) {
  console.error('Failed to get WiFi info:', error);
  return null;  // 返回 null 而非抛出异常
}
```

### 调试日志

添加详细的日志输出，便于问题诊断：
```typescript
console.log('[WiFiAdapter] Executing: netsh wlan show interfaces with UTF-8 encoding');
console.log('[WiFiAdapter] Command output length:', output.length);
console.log('[WiFiAdapter] Parsed data keys:', Object.keys(data));
console.log('[WiFiAdapter] SSID:', ssid);
```

## 兼容性

### Windows 系统
- ✅ Windows 10/11（英文/中文环境）
- ✅ 支持中文 SSID
- ✅ 支持不同语言环境的字段名

### macOS 系统
- ✅ macOS 10.15+
- ✅ 使用系统框架 `Apple80211.framework`
- ✅ 支持中文 SSID（UTF-8 原生支持）

### 数据完整性
获取的 WiFi 信息包括：
- SSID（WiFi 名称）
- 信号强度（0-100%）
- 连接速度（Mbps）
- 频段（2.4GHz / 5GHz）
- 信道号
- BSSID（AP MAC 地址）
- 安全类型（认证方式）
- IPv4 地址
- IPv6 地址
- MAC 地址
- 默认网关
- DNS 服务器
- 子网掩码
- 网络延迟（ms）

## 未来改进方向

1. **Linux 支持**：添加 `nmcli` 命令支持
2. **缓存机制**：减少频繁的系统命令调用
3. **更好的错误提示**：针对不同失败原因给出具体提示
4. **多网卡支持**：检测并选择正确的 WiFi 网卡

## 参考资料

- [Windows netsh 命令文档](https://learn.microsoft.com/en-us/windows-server/networking/technologies/netsh/netsh)
- [Apple80211 框架](https://developer.apple.com/library/archive/documentation/Networking/Conceptual/SystemConfigFrameworks/)
- [Node.js child_process](https://nodejs.org/api/child_process.html)
- [字符编码：GBK vs UTF-8](https://en.wikipedia.org/wiki/GBK_(character_encoding))
