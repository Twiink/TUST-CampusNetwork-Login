# 更新日志 (CHANGELOG)

所有显著的变更都会记录在此文件。每次发布 GitHub Release 后，Release 说明会自动追加到对应版本条目下。

本项目遵循[语义化版本控制](https://semver.org/lang/zh-CN/) (Semantic Versioning)。

## [未发布]

### 新增

- 两端账号/WiFi 编辑、关联账号排序、附近 WiFi 扫描选择；Android 每网络自动连接开关与手动连接入口。
- Android 重连阶段、尝试次数、冷却倒计时与失败清单；统一持久日志和系统分享导出。
- Android 应用内更新检查、下载进度、取消、重试、重启恢复、安装授权及包名/版本/签名校验。
- 三平台真实 Electron 业务 E2E、Android API 28/36 原生集成和固定 Maestro 2.12.0 用户流程、失败诊断归档及汇总门禁。

- **WiFi 管理**：多 WiFi 配置、优先级管理（1-99）、三阶段自动重连（单 WiFi 重试 → 优先级切换 → 全面失败提示）、实时重连进度显示、手动切换、1 秒间隔连接状态监测。
- **无需认证 WiFi 自动连接**（Windows）：连接过一次的免认证 WiFi 断开后自动重连。
- **校园网认证**：多账户管理、服务商选择（校园网/移动/联通/电信）、WiFi 与账户关联、自动登录、认证失效自动重连。
- **心跳检测**：可配置间隔的网络连通性检测，与 WiFi 连接状态绑定，断开时显示暂停提示。
- **日志系统**：分类与级别筛选（debug/info/success/warn/error）、系统信息采集、文件导出、打开日志目录、自动清理（7 天 / 500 条）。
- **系统集成**：开机自启、系统托盘（桌面端）、系统通知、应用内自动更新（桌面端 electron-updater / 移动端 APK 下载引导）、Android 后台服务。
- **macOS 支持**：WiFi 状态检测与认证链路兼容 macOS。

### 变更

- **全平台性能优化**：网络探测并行化（最坏 15s→3s）、Logger 环形缓冲 + 500ms 批量持久化（持久化写入放大 2,375,250 条→500 条）、WiFi 快照 1.5s TTL 缓存、主进程移除 1Hz 倒计时 IPC、托盘图标常驻缓存、存储防抖原子写、挂起恢复立即检测。
- **第二轮极限性能优化**：三平台原生 WiFi/网络信息优先 + TS 自动回退、Linux `getifaddrs`/netlink 与 Windows `GetAdaptersAddresses` 原生网络信息、首个 204 即判定在线、延迟 HEAD 单目标 2s 超时 + 60s 缓存、日志 250ms 批量 IPC、隐藏窗口不广播、原生事件可用时 WiFi 兜底轮询降为 30s、系统挂起暂停心跳、托盘隐藏 120s 后销毁渲染进程（`destroyHiddenWindowAfterMs` 可配置）、日志订阅仅在日志页激活、`perf-memory.mjs` 进程树基准。
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

- F1–F11：Darwin 地址/路由布局、配置并发与原生同步、WiFi/认证/联网状态、冷却后调度、日志密码泄漏、Android WiFi 路由、关联账号选择、持久暂停、多账号异常回退、四运营商协议一致性及 Windows 异步连接确认。
- Windows 首次连接 profile 与临时凭据清理；Android 通用和 ABI 包使用一致递增 versionCode 规则。
- 验证状态和测试映射见 `docs/REMEDIATION.md`；全平台验收以对应 CI 记录为准。

- WiFi 详情与日志页内容溢出、长文本省略号、Grid 子项溢出。
- 网络延迟测定改为优先百度、其次测速网。
- 移动端 jest 转换与 pnpm 依赖解析配置。
- 桌面端与 Android 发布构建、release 工作流初始化顺序等 CI 问题。

## [v1.0.1] - 2026-10-27

**Full Changelog**: https://github.com/Twiink/TUST-CampusNetwork-Login/compare/v1.0.0...v1.0.1

## [v1.0.0] - 2026-10-26

**Full Changelog**: https://github.com/Twiink/TUST-CampusNetwork-Login/compare/v0.0.2...v1.0.0
