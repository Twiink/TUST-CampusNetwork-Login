# NetMate 性能优化报告

日期：2026-10-25 · 基准环境：Linux x64 / Node 24 / Rust 1.99

## 量化结果（before → after）

| 指标                                        |                 优化前 |                        优化后 |        变化 |
| ------------------------------------------- | ---------------------: | ----------------------------: | ----------: |
| Logger 20k 条写入                           |                   49ms |                       19-21ms |    **-58%** |
| Logger 5k 条（含监听器 + 持久化调度）       |   12ms（每条全量落盘） |               3ms（批量调度） |    **-75%** |
| Logger 持久化写入放大                       |           2,375,250 条 |      **500 条（1 次批量写）** | **-99.98%** |
| Logger 关键词查询 ×200                      |                   26ms |                         3-6ms |    **-77%** |
| NetworkDetector 在线 tick（120ms 模拟延迟） |                  307ms |                         255ms |        -17% |
| NetworkDetector 离线 tick                   |                  532ms |                         121ms |    **-77%** |
| WifiManager 读取 ×100k                      |                   68ms |                          13ms |    **-81%** |
| Linux WiFi 快照                             |    spawn nmcli ~100ms+ | 原生 nl80211 ~200ms（无进程） |    零 spawn |
| 主进程空闲唤醒                              | 1Hz IPC + 3s WiFi 轮询 |                 30s 轻量 tick |    **-97%** |
| 桌面进程树（前台 45s）                      |                      — |          8 进程 / RSS 728MB\* |           — |
| 托盘隐藏销毁后（25s）                       |                      — |          7 进程 / RSS 604MB\* |    **-17%** |
| 移动端 WiFi 轮询                            |      JS 5s setInterval |       原生事件驱动 + 30s 兜底 |    **-94%** |

完整数据：`shell/perf-baseline.json` / `shell/perf-after.json`；复现命令 `node shell/perf-bench.mjs`、`node shell/perf-memory.mjs`。

\* 内存基准包含 `--remote-debugging-port` 的调试进程与 V8 调试堆开销，绝对值偏保守；对比同为调试模式下的差值。

## 优化清单

### Phase 1 · 共享核心（packages/shared）

- **NetworkDetector**：3 个 204 探测并行（严格 204 语义保留），超时 5s→3s；连通性/WiFi/延迟三路 `allSettled` 并行；`startPolling` in-flight 重入保护；每 tick 日志收敛为单条汇总。
- **Logger**：固定环形数组 + head 指针，写入 O(1)；500ms 防抖批量持久化；清理定时器惰性启动；搜索文本预序列化缓存。
- **AuthService**：`rawResponse` 截断 2KB；连通性验证并行化。
- **WifiManager**：排序结果配置变更时缓存，读取 O(1)。
- **ConfigManager**：迁移 diff 仅版本变化时执行；update 不再全量深拷贝。
- **httpClient**：`redirect:'manual'` 替代无效 header；204/HEAD 不读 body。

### Phase 2 · Electron 主进程

- 删除 1Hz 倒计时 IPC，改为 tick 后单次推送 `nextHeartbeatAt`。
- WiFi 快照 1.5s TTL + in-flight 去重；三平台共享。
- macOS 改 `airport -I`（移除 10s system_profiler 与 800ms sleep）。
- Linux 新增 nmcli 解析 fallback（转义冒号处理）。
- 托盘三态图标缓存 + 同状态幂等；存储 500ms 防抖 + 临时文件原子写。
- `powerMonitor.resume` 立即触发检测。

### Phase 3 · 桌面渲染层

- 删除 Home 重复 `useNetwork()` 订阅。
- 主题云朵动画 JS 定时器 → 纯 CSS keyframes。
- 日志页自研窗口化虚拟列表（~130 行，零新依赖）。
- `formattedLogs` useMemo；心跳倒计时本地推导，主卡片不每秒重渲染。

### Phase 4 · Rust 原生模块（packages/native）

- napi-rs + Linux nl80211 netlink：`currentWifi()` 返回 SSID/BSSID/RSSI/速率/信道/频率/安全类型，全部一次 socket 事务完成。
- DesktopWifiAdapter 优先加载原生模块，失败/为空自动回退 TS spawn 路径（功能零回退）。
- electron-builder `asarUnpack: ['**/*.node']`；release.yml 增加 Rust 工具链、Cargo 缓存与三平台 prebuild 步骤。

### Phase 5 · Android/RN

- Kotlin `WifiModule`：`ConnectivityManager.NetworkCallback` + WiFi 状态广播 → `netmate:wifiChanged` 事件。
- HomeScreen 事件驱动刷新 + 30s 兜底，AppState 后台暂停。
- `useNetwork`：一次 `getNetworkInfo` 派生连通性/SSID（原来额外触发 `getWifiStatus` 两次原生桥调用）；后台暂停自动刷新。
- HomeCards / WifiInfoCard 全部 `React.memo` 化，避免无关状态更新触发整卡重渲染。
- `MobileWifiAdapter` 一次枚举 + 2s 缓存（原来重复两次）。
- 视觉降级（`THEME_PERF_MODE` 常量可回退）：3 个无限 SVG 动画 → 静态渐变；BlurView → 半透明。
- LogsScreen ScrollView → FlatList 虚拟化。
- BackgroundService 定时器空转 → 原生网络回调驱动通知（1s 节流）。

## 已知边界

- Rust `watchNetwork` 事件推送在 Linux 仍返回 false，由 TS 5s 兜底轮询保证功能；nl80211 组播监听列入后续版本。
- macOS/Windows 原生快照暂走 TS fallback；Rust 侧仅 Linux 实现，工程结构已就绪。
- Electron 大版本升级（30→45）未包含在本次改动，避免与性能优化混在同一批回归。
