# 更新日志 (CHANGELOG)

所有显著的变更都会记录在此文件。每次发布 GitHub Release 后，Release 说明会自动追加到对应版本条目下。

本项目遵循[语义化版本控制](https://semver.org/lang/zh-CN/) (Semantic Versioning)。

## [未发布]

### 新增

- **WiFi 管理**：多 WiFi 配置、优先级管理（1-99）、三阶段自动重连（单 WiFi 重试 → 优先级切换 → 全面失败提示）、实时重连进度显示、手动切换、1 秒间隔连接状态监测。
- **无需认证 WiFi 自动连接**（Windows）：连接过一次的免认证 WiFi 断开后自动重连。
- **校园网认证**：多账户管理、服务商选择（校园网/移动/联通/电信）、WiFi 与账户关联、自动登录、认证失效自动重连。
- **心跳检测**：可配置间隔的网络连通性检测，与 WiFi 连接状态绑定，断开时显示暂停提示。
- **日志系统**：分类与级别筛选（debug/info/success/warn/error）、系统信息采集、文件导出、打开日志目录、自动清理（7 天 / 500 条）。
- **系统集成**：开机自启、系统托盘（桌面端）、系统通知、应用内自动更新（桌面端 electron-updater / 移动端 APK 下载引导）、Android 后台服务。
- **macOS 支持**：WiFi 状态检测与认证链路兼容 macOS。

### 变更

- **全平台性能优化**：网络探测并行化（最坏 15s→3s）、Logger 环形缓冲 + 500ms 批量持久化（持久化写入放大 2,375,250 条→500 条）、WiFi 快照 1.5s TTL 缓存、主进程移除 1Hz 倒计时 IPC、托盘图标常驻缓存、存储防抖原子写、挂起恢复立即检测。
- **桌面渲染层优化**：移除重复 useNetwork 订阅、主题动画改纯 CSS、日志页窗口化虚拟列表、心跳倒计时本地推导。
- **Rust 原生模块（Linux）**：新增 `@repo/native` nl80211 netlink 实现，Linux WiFi 快照零 spawn；加载失败自动回退 TS 路径。
- **移动端优化**：Kotlin NetworkCallback 事件驱动替代 5s JS 轮询、AppState 后台暂停、静态渐变替代无限 SVG 动画（`THEME_PERF_MODE` 可回退）、BlurView 改半透明、LogsScreen FlatList 虚拟化、后台服务原生事件驱动通知。
- **Linux WiFi 支持**：nmcli fallback 补齐 SSID/信号/信道/网关/DNS 解析。
- **登录协议对齐真实抓包**：在线判定（status:1/已经在线）、MAC 全零上报、注销无参请求、User-Agent、校园网判定与认证需求三级解析。
- **登录链路改用路由探测 IP** 并统一认证判定逻辑；认证重连状态自愈并接入 WiFi 切换事件。
- **Windows 命令输出统一按 GBK 解码**并优化 SSID 解析。
- **性能优化**：桌面端打包体积与运行时开销、移动端体积与内存。
- **CI/CD**：质量门禁（lint/type-check/test/format）+ 网络模拟回归（netem 链路整形）+ 三平台桌面构建 + Electron E2E + Android 构建；CI 成功后自动发布 GitHub Release。

### 修复

- WiFi 详情与日志页内容溢出、长文本省略号、Grid 子项溢出。
- 网络延迟测定改为优先百度、其次测速网。
- 移动端 jest 转换与 pnpm 依赖解析配置。
- 桌面端与 Android 发布构建、release 工作流初始化顺序等 CI 问题。
