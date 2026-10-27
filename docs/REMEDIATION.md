# F1–F11 修复与验证记录

日期：2026-10-27。基线：v1.0.1 / 9e4b563。实施分支：`codex/netmate-feature-completion`。

状态：11 项均已实现修复并加入对应回归；正在完成全平台远程验证，尚未验收通过。第一轮 CI：[40476315775](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/runs/40476315775)。

## 缺陷与测试映射

| 编号 | 修复                                                                                | 长期回归证据                                                                                          |
| ---- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| F1   | Darwin libc 地址结构、sa_len/4 字节路由对齐和边界检查；原生字段逐项校验回退         | `packages/native/src/macos.rs` 的 ABI、网关和截断报文测试；macOS CI                                   |
| F2   | ConfigManager 串行 functional update、revision；落盘与原生确认后发布 UI、失败可重试 | 共享 `feature-regressions.test.ts`；移动 `AppContext.test.tsx`；编辑/重启 E2E                         |
| F3   | AppContext 统一网络快照；区分 WiFi 关联、认证和互联网；丢弃旧请求/旧网络事件        | 移动 AppContext/HomeScreen 测试；原生 `NativeEngineIntegrationTest.kt`                                |
| F4   | 全失败后显式调度唯一任务，最小 5 秒，配置/硬件/服务变化取消                         | 桌面 `wifi-event-listener.regressions.test.ts`；`regressions.spec.ts`；Android reconnect flows        |
| F5   | 连接边界只返回安全错误码；Logger/原生日志入库与导出脱敏                             | 共享 feature regressions；桌面 `wifi-switcher.test.ts`；Android `LogJournalTest.kt`                   |
| F6   | 实际 WiFi Network 快照和请求绑定，前后台共用原生串行引擎                            | 原生 LocalAddresses/policy 测试、NativeEngineIntegrationTest；API 28/36 Maestro                       |
| F7   | 首页、托盘和自动认证按同一 WiFi 关联顺序选择账号                                    | 共享 feature regressions；桌面 `auth-session.test.ts`、账号回退 E2E                                   |
| F8   | 注销前持久暂停，失败仍暂停；恢复或手动连接解除；最近成功服务器注销                  | 桌面 auth-session、移动 AppContext、原生 integration、重启暂停 E2E                                    |
| F9   | 单个账号异常记录为失败并继续后续账号                                                | 共享 feature regressions；原生 integration；两端账号回退 E2E                                          |
| F10  | 四运营商和 RFC3986 参数编码统一                                                     | `packages/shared/fixtures/portal-protocol.json`；共享测试和 `ProtocolFixtureTest.kt` 读取同一 fixture |
| F11  | Windows 等待目标 SSID、连接状态及可用 IP；超时返回候选流程                          | 桌面 wifi-switcher 测试；三平台重连 E2E 在硬件边界确认流程                                            |

## 新功能证据

- 两端编辑和扫描入口：ConfigEditor、NearbyWifi；共享编辑测试、移动 FeatureComponents 测试、桌面配置 E2E。覆盖稳定 ID、密码保留/清空、关联顺序和保存失败。
- Android 手动连接、每 WiFi 开关及进度：WifiModule、WifiConnector、ReconnectEvents、AutoAuthStatus；API 28/36 flows。实际无线授权仍受系统和硬件影响。
- Windows 首次连接：profile XML、当前用户安装及 finally 清理；wifi-switcher 测试覆盖特殊字符、成功/失败清理和连接确认。
- Android 日志：LogJournal、LogModule；JVM 覆盖重启读取、筛选、清空、7 天清理、轮转和包含控制字符的字节上限；Maestro 验证导出入口。
- Android 更新：UpdateModule、ApkPolicy、UpdateCard；JVM 校验包名/版本/签名和 ABI 升级规则；组件测试错误及取消；Maestro 验证下载、取消、错误签名拒绝和同签名升级安装。

## 已执行验证

本机未执行任何 E2E。已通过共享 115 项、桌面 184 项、移动 78 项单元/组件测试；Android JVM 27 项通过、无跳过；全工作区类型检查、lint 和 format 通过。桌面 E2E 专用构建、Android debug/e2e/release Kotlin 编译均通过。

首轮远程 CI 的质量门禁、网络模拟、Windows/Linux 原生构建通过。三个桌面平台均通过 24/25 个真实业务 E2E，离线场景暴露 null 快照问题；macOS 原生编译缺少 Foundation 集合遍历特性；Android 全新环境缺少 shared 构建产物。上述问题已修复，等待下一轮矩阵确认。Android 模拟器因构建失败尚未执行，不能把跳过视为通过。

最终验收需所有 job 与每个平台 E2E 成功，并保留对应 Actions 链接及 artifact；本文件将据实际结果更新。

## 验证范围

受控门户、模拟账号和硬件边界用于验证真实 UI、业务服务、IPC/桥接、调度、下载、存储与系统安装器。真实校园网、实际 WiFi 驱动、双网络真机路由和厂商后台保活另需对应环境验证。iOS 不在本轮支持范围。
