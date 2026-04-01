# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NetMate 是面向天津科技大学（TUST）的跨平台 WiFi 管理与校园网自动认证工具。目标平台：Windows、macOS、Android。iOS 不在首版交付范围内，已有代码可保留。

## Monorepo Structure

pnpm workspace monorepo，三个包：

- **`packages/shared`** (`@repo/shared`): 跨平台核心业务层 — 认证协议、配置管理、网络探测、日志。用 tsup 编译为 CJS/ESM。
- **`apps/desktop`** (`netmate-desktop`): Electron 30 + React 18 + Vite 桌面端。
- **`apps/mobile`** (`mobile`): React Native 0.83 移动端（Android 为主）。

## Common Commands

```bash
# 依赖安装
pnpm install

# 开发
pnpm dev:desktop          # Vite + Electron 桌面端开发
pnpm dev:mobile           # Metro + shared watch 移动端开发
pnpm android              # 构建并运行 Android 应用

# 构建
pnpm build:shared         # 仅构建 shared 包
pnpm build:desktop        # 仅构建桌面端渲染层
pnpm build                # 构建 shared + desktop

# 打包分发
pnpm dist                 # 打包当前平台
pnpm dist:win / dist:mac / dist:linux

# 代码质量
pnpm lint                 # ESLint (--max-warnings=0)
pnpm lint:fix
pnpm format               # Prettier
pnpm format:check
pnpm type-check           # TypeScript noEmit 检查

# 测试
pnpm test                 # 运行全部测试
pnpm test:shared          # 运行 shared 包单元测试
pnpm test:desktop         # 运行桌面端测试
pnpm -C apps/mobile test  # 运行移动端测试

# 单包命令
pnpm -C packages/shared build
pnpm -C apps/desktop dev
pnpm -C apps/mobile start
```

## Architecture

### 双层重连架构（核心设计模式）

WiFi 层与认证层解耦：

1. **WiFi 层**（系统级）：每 1s 检测 SSID 变化，3 阶段重连（重试当前 WiFi → 按优先级切换 → 广播全部失败）。`apps/desktop/electron/services/wifi-event-listener.ts`
2. **认证层**（应用级）：通过心跳检测认证失败，指数退避重试。`apps/desktop/electron/services/auto-reconnect.ts`
3. **协调**：WiFi 重连成功 → 触发网络状态更新 → 认证层检测到需要认证 → 自动登录。两层无直接依赖。

### Shared 包 (`packages/shared/src/`)

| 服务 | 文件 | 职责 |
|------|------|------|
| `AuthService` | `services/AuthService.ts` | 校园网登录/登出，处理运营商后缀、JSONP 响应解析 |
| `NetworkDetector` | `services/NetworkDetector.ts` | 连通性检测、认证状态判断、延迟测量、WiFi 信息聚合、轮询 |
| `ConfigManager` | `services/ConfigManager.ts` | 配置加载/验证/合并/保存/重置 |
| `AccountManager` | `services/AccountManager.ts` | 多账户 CRUD、当前账户切换 |
| `WifiManager` | `services/WifiManager.ts` | WiFi 配置 CRUD、SSID 匹配、优先级筛选 |
| `RetryPolicy` | `services/RetryPolicy.ts` | 固定/指数退避策略 |
| `StorageAdapter` | `services/StorageAdapter.ts` | 跨平台持久化抽象接口 |
| `WifiAdapter` | `services/WifiAdapter.ts` | WiFi 信息跨平台适配接口 |

类型定义在 `types/`，常量在 `constants/`，日志模型在 `models/`。

### 桌面端 (`apps/desktop/`)

**Electron 主进程** (`electron/`):
- `main.ts`: 生命周期管理，初始化所有服务，设置 IPC。
- `preload.ts`: 通过 contextBridge 暴露 IPC API。
- `ipc/`: 按领域组织的 IPC 处理模块。通道名定义在 `ipc/channels.ts`。
- `services/`: 平台实现 — WiFi 检测/切换、自动重连、托盘、通知、更新、自启、加密存储。

**React 渲染层** (`src/`):
- 4 个页面：Home（状态面板）、Settings（账户/WiFi 配置）、Logs（日志查看）、About（版本/更新）。
- `hooks/` 下的自定义 Hook 对应各 IPC 领域。

### 移动端 (`apps/mobile/`)

- React Native 底部 Tab 导航（Home、Settings、Logs）。
- `AppContext` 用 AsyncStorage 适配器初始化 shared 服务。
- Android 原生模块：`WifiModule.kt`、`BackgroundServiceModule.kt`、`AutoStartModule.kt`、`BootReceiver.kt`。

## Key Conventions

- **语言**：源码注释和文档使用中文。
- **IPC 模式**：Renderer 调用 `window.electronAPI.method()` → preload 桥接 `ipcRenderer.invoke(channel)` → 主进程 handler 响应。事件订阅使用 `event:` 前缀通道。
- **密码**：桌面端通过 `safeStorage` 加密存储（字段名含 `password` 或 `userPassword` 自动加解密）；移动端通过安全存储方案。
- **Shared 包必须先构建**：`pnpm build:shared`。`dev:mobile` 脚本已包含 concurrent watch，`dev:desktop` 需要预构建。

## 提交规则

- 提交信息使用**中文**，内容简洁明确，含 scope 前缀：`desktop: 修复托盘重连状态` / `shared: 添加 WiFi 多账号绑定`。
- **每次**完成任何代码修改后，必须使用 `git add .` 暂存所有变更，再用中文 `git commit -m "提交信息"` 提交。
- 除非用户明确要求仅暂存不提交，否则 AI Agent 不得跳过上述 `git add .` 与中文提交步骤，也不得只暂存部分文件。
- **禁止**在 commit message 中保留任何 AI 协作者尾注，包括但不限于：
  - `Co-Authored-By: Claude ...`
  - `Co-Authored-By: Anthropic ...`
  - 其他 AI 模型/厂商自动追加的 attribution
- commit author 只保留真实人类维护者，**不允许 GitHub 贡献者列表中出现 AI 人员**。
- 仓库内置 `.githooks/commit-msg` 钩子，会在提交时自动移除常见 AI co-author 尾注。
- 如本地未启用钩子，请执行：`git config core.hooksPath .githooks`。

### 禁止的 Git 操作

以下操作**严格禁止** AI Agent 执行，必须由用户手动操作：

- `git push`（包括 `--force`、`-u` 等所有变体）
- `git pull` / `git fetch`
- `gh pr create` / `gh pr merge` 及所有 GitHub CLI 远程操作
- `git remote` 相关修改
- 任何涉及远程仓库交互的命令

AI Agent 的 Git 操作范围**仅限于本地**：`git add`、`git commit`、`git status`、`git diff`、`git log`、`git branch`、`git checkout`、`git stash` 等。

## Environment Requirements

- Node.js >= 18（移动端需 >= 20）
- pnpm >= 8
- 移动端：Android Studio, JDK 17+

---

##  功能需求规格

以下是 NetMate v1 必须实现的完整功能需求，所有开发工作必须围绕这些需求展开。

### REQ-01: WiFi 配置与记录

- 支持两类 WiFi：需要校园网门户认证的（如校园网）和不需要的（如家庭 WiFi、热点）。
- WiFi 匹配以 SSID 为主，辅以 `security` + `BSSID` 精确匹配，避免同名 WiFi 误判。
- 连接到未记录的 WiFi 时，只提示用户是否添加记录，不主动切换或干预当前连接。
- 首版不支持隐藏 SSID 和企业级 802.1X WiFi。

### REQ-02: WiFi 密码管理

- 应用存储 WiFi 连接密码（WPA/WPA2 等），实现真正的首连能力。
- 桌面端通过 `safeStorage` 加密存储，移动端通过安全存储方案。
- Windows 端由应用内生成 WiFi profile 实现首连，不依赖系统已保存的 profile。

### REQ-03: WiFi 数据模型变更

WiFi 配置数据模型必须包含以下字段变更：
- 新增 `password` 字段（加密存储 WiFi 连接密码）。
- `linkedAccountId`（字符串）改为 `linkedAccountIds`（字符串数组），支持一个 WiFi 绑定多个认证账号。
- 新增 `lastConnectedAt` 字段（最近成功连接时间，用于同优先级排序）。

### REQ-04: 启动与首页状态

- 未连接 WiFi 时，首页进入"未连接"状态，用户可手动连接已记录 WiFi。
- "启动时无 WiFi 自动连接"必须是可配置开关（默认关闭）。
- "启动时保持当前已连接 WiFi 而非切换到更高优先级"必须是可配置开关（默认开启）。
- 首页展示 WiFi 详细信息：SSID、信号强度、延迟、连接速度、频段、IP、网关、DNS、BSSID、信道、安全类型。
- 首页根据 WiFi 状态（是否连接、是否已记录、是否需要认证、是否已绑定账户）分阶段展示不同提示。

### REQ-05: WiFi 连接与切换策略

- 支持用户主动切换 WiFi。
- 已记录 WiFi 之间有优先级（数字越小越高），同优先级按 `lastConnectedAt` 降序。
- 用户手动切换的 WiFi 仅作为"本次会话首选重连目标"，不改写长期优先级。
- 手动切换失败时：先回退原 WiFi → 若回退也失败 → 进入自动重连/切换策略。
- **用户手动切换时必须立即中断正在进行的自动重连流程。**

### REQ-06: 断线重连策略

- WiFi 断开后重连顺序：先重试刚断开的 WiFi → 失败达上限后按优先级尝试其他已记录 WiFi。
- 以下参数均由用户配置：
  - 单个 WiFi 重试次数（默认 3 次）
  - 冷却期时长（默认 5 分钟）
- 冷却期内该 WiFi 不被重复尝试。
- 所有 WiFi 全部失败后进入冷却期，冷却结束后从头轮询，完整轮询最多 3 次，之后停止自动重连。

### REQ-07: 心跳与认证策略

- 心跳检测**默认开启**，用户可关闭。
- 以下参数均由用户配置：
  - 心跳间隔（如 30s、60s）
  - 连续失败阈值（默认 2-3 次）
- 心跳失败时区分两种场景：
  - WiFi 仍连接但认证/网络失效 → 自动重新认证
  - WiFi 已断开 → 进入 WiFi 重连流程
- 无需认证的 WiFi 心跳失败后尝试重连 WiFi，不立刻切换。
- 认证优先使用该 WiFi 绑定的账号，不仅仅依赖全局当前账号。

### REQ-08: 多账号认证

- 支持多运营商账号（移动、联通、电信、教育网）。
- 一个 WiFi 可绑定多个认证账号（`linkedAccountIds` 数组）。
- 认证时按绑定顺序依次尝试，全部失败后才判定该 WiFi 认证失败。

### REQ-09: 应用设置模型

应用设置必须包含以下可配置项：
- 心跳检测开关（默认开启）
- 心跳间隔
- 连续失败阈值
- 单个 WiFi 重试次数
- 冷却期时长
- 启动时无 WiFi 自动连接开关
- 启动时保持当前连接开关
- 各通知场景独立开关（见 REQ-12）

### REQ-10: 后台与开机行为

- Android：退到后台后继续心跳检测和自动重连；开机后自动启动并执行连接/重连。
- Android：需完成权限引导闭环（前台服务、开机自启、定位/WiFi 权限、电池优化白名单）。
- 桌面端：关闭窗口缩到托盘继续运行，心跳和自动重连不中断。

### REQ-11: WiFi 配置导入/导出

- 用户可将已记录的 WiFi 配置（含账号绑定关系）导出为文件。
- 可从文件导入，便于跨设备迁移或备份恢复。

### REQ-12: 通知策略

每种通知场景作为独立开关，不使用全局统一开关：
- WiFi 断开通知
- 自动重连成功通知
- 自动重连全部失败通知
- 认证失效并自动重新认证通知

### REQ-13: 自动更新

- 桌面端：完整的"检查更新 → 下载 → 安装"交互闭环。
- 移动端：版本检查与更新引导。

---

## 测试策略

所有新功能和 bug 修复都必须附带相应的测试。测试是代码合入的前提条件。

### 测试分层

#### 1. 单元测试（Unit Tests）

**范围**：`packages/shared` 全部服务和工具函数。

**必须覆盖的模块**：
- `ConfigManager`：配置加载/验证/合并/默认值/重置
- `AccountManager`：多账户 CRUD、当前账户切换、首账户自动设为当前
- `WifiManager`：WiFi 配置 CRUD、SSID+BSSID+security 匹配、优先级排序、`lastConnectedAt` 排序、`linkedAccountIds` 多账号绑定
- `AuthService`：登录/登出请求构造、运营商后缀处理、JSONP 响应解析（成功/失败/已在线）、多账号依次尝试
- `NetworkDetector`：连通性检测结果解析、认证状态判断、心跳失败场景区分
- `RetryPolicy`：固定退避/指数退避/冷却期计算
- `Logger`：日志级别筛选、条数上限、过期清理、导出
- 配置导入/导出：序列化/反序列化/数据校验

**工具**：Vitest（shared 包）
**命名**：`*.test.ts`，与被测文件同目录或 `__tests__/` 子目录
**运行**：`pnpm test:shared`

#### 2. 组件测试（Component Tests）

**范围**：桌面端 React 组件和移动端 React Native 组件。

**必须覆盖的场景**：
- Home 页状态切换：未连接 / 已连接未记录 / 已记录未认证 / 已认证
- Settings 页：账户列表渲染、WiFi 配置表单验证、多账号绑定 UI
- 心跳倒计时与重连进度展示
- 通知开关独立控制

**工具**：
- 桌面端：Vitest + React Testing Library
- 移动端：Jest + React Native Testing Library

#### 3. 集成测试（Integration Tests）

**范围**：跨模块协作流程。

**必须覆盖的流程**：
- 完整登录链路：选择账号 → 构造请求 → 解析响应 → 更新状态
- WiFi 匹配链路：检测到 SSID → 精确匹配 WiFi 配置 → 判断是否需要认证 → 选择绑定账号
- 断线重连状态机：WiFi 断开 → 重试当前 → 冷却 → 按优先级切换 → 全部失败
- 心跳检测链路：定时检测 → 连续失败计数 → 区分 WiFi 断开 vs 认证失效 → 触发对应恢复流程
- 配置导入/导出：导出 → 导入 → 验证配置完整性
- 手动切换中断自动重连

**工具**：Vitest（可 mock 平台 API）

#### 4. IPC/API 测试

**范围**：Electron IPC 通道和 React Native 原生桥接。

**必须覆盖**：
- 所有 IPC channel 的请求/响应契约
- preload 暴露的 API 完整性
- 错误处理：无效参数、超时、主进程异常

#### 5. E2E 测试（End-to-End Tests）

**范围**：桌面端关键用户流程。

**必须覆盖的场景**：
- 首次启动 → 添加账户 → 添加 WiFi 配置 → 手动登录 → 登出
- WiFi 配置导入/导出完整流程
- 设置项修改并持久化验证
- 关于页检查更新交互

**工具**：Playwright（Electron 模式）或 Spectron 替代方案
**运行**：`pnpm test:e2e`

#### 6. 平台特定测试

**Windows**：WiFi profile 生成与首连能力验证
**macOS**：WiFi 检测与切换 shell 命令执行验证
**Android**：原生模块桥接正确性（WifiModule、BackgroundService、BootReceiver）

### 测试规则

- **新功能必须附带测试**：PR 中新增功能代码必须同时包含对应测试。
- **Bug 修复必须有回归测试**：先写失败的测试复现 bug，再修复使其通过。
- **shared 包目标覆盖率**：语句覆盖 >= 80%，分支覆盖 >= 70%。
- **测试必须可独立运行**：不依赖真实网络环境、不依赖真实 WiFi 硬件。网络请求和 WiFi 操作通过 mock/stub 隔离。
- **测试命名清晰**：使用中文描述测试意图，如 `it('当所有绑定账号认证失败时应判定 WiFi 认证失败')`。
- **CI 门禁**：`pnpm lint && pnpm type-check && pnpm test` 全部通过是合入前提。

---

## aivectormemory 记忆规范

开发过程中必须主动调用 `aivectormemory` MCP 工具进行记忆管理，覆盖以下场景：

### 1. 开始任何任务前

- 调用 `recall` 搜索与当前任务相关的历史经验、已知问题、架构决策。
- 关键词包括：涉及的包名（shared/desktop/mobile）、服务名（AuthService、WifiManager 等）、功能名、IPC 通道名、原生模块名等。
- 若找到相关记忆，优先参考历史方案，避免重复踩坑。

### 2. 修复 Bug 后

调用 `remember` 记录：
- bug 所在的包和文件路径（如 `packages/shared/src/services/AuthService.ts`）
- bug 的根本原因（逻辑错误、类型问题、IPC 通道遗漏、平台差异等）
- 修复方案及关键改动
- 涉及的服务、Hook、IPC 通道、原生模块
- 该 bug 是否可能在其他平台复现
- 标签：`["bug", "修复", "<包名>", "<模块名>"]`

### 3. 完成新功能开发后

调用 `remember` 记录：
- 功能概述及所在包
- 核心设计决策（为什么这样设计，被否决的方案）
- 关键文件路径（Service、Hook、IPC handler、组件、原生模块）
- 特殊处理逻辑、边界条件、平台差异处理
- 标签：`["功能", "<包名>", "<功能名>"]`

### 4. 新增或修改数据模型后

调用 `remember` 记录：
- 修改的类型定义文件（如 `packages/shared/src/types/`）
- 字段变更内容（新增、重命名、类型变更）
- 对配置存储的影响（是否需要迁移已有配置）
- 对桌面端/移动端的影响范围
- 标签：`["model", "类型", "<模型名>"]`

### 5. 新增或修改 IPC 通道后

调用 `remember` 记录：
- 通道名称及定义位置（`ipc/channels.ts`）
- IPC handler 文件路径
- preload 暴露的 API 方法
- 请求参数和响应数据类型
- 是否需要同步更新 preload 事件白名单
- 标签：`["ipc", "通道", "<领域名>"]`

### 6. 修改平台特定实现后

调用 `remember` 记录：
- 涉及的平台（Windows/macOS/Linux/Android）
- 平台实现文件路径（如 `electron/services/wifi-switcher.ts`、`android/WifiModule.kt`）
- 平台差异处理方式（shell 命令差异、API 差异）
- 踩过的坑、特殊限制（如 Windows WiFi profile 格式、Android 权限要求）
- 标签：`["平台", "<平台名>", "<模块名>"]`

### 7. 修改 shared 包公共接口后

调用 `remember` 记录：
- 变更的接口/类型/服务
- 对桌面端和移动端的影响
- 是否有 breaking change 需要两端同步修改
- 标签：`["shared", "接口", "<服务名>"]`

### 8. 处理 WiFi 重连/认证重连逻辑后

调用 `remember` 记录：
- 涉及的重连阶段（WiFi 层 / 认证层 / 两层协调）
- 状态机变更或新增的状态转换
- 配置项依赖（重试次数、冷却期、心跳间隔等）
- 边界条件处理（手动切换中断、冷却期内跳过等）
- 标签：`["重连", "策略", "<层名>"]`

### 9. 处理加密存储/安全相关后

调用 `remember` 记录：
- 涉及的存储方案（safeStorage / AsyncStorage / 安全存储）
- 加密/解密的字段和时机
- 平台差异（桌面端 vs 移动端）
- 标签：`["安全", "存储", "<平台名>"]`

### 10. 发现项目约定或架构规律后

调用 `remember` 记录：
- 发现的隐性约定（命名规律、IPC 模式、Hook 组织方式等）
- 对现有代码模式的总结
- 标签：`["架构", "约定", "<关键词>"]`

### 11. 处理构建/打包/分发问题后

调用 `remember` 记录：
- 问题现象与根本原因
- 涉及的构建工具（tsup/vite/electron-builder/metro/gradle）
- 解决步骤和配置变更
- 标签：`["构建", "<工具名>", "<平台名>"]`

### 12. 每次对话结束前（必须）

- 调用 `auto_save` 保存用户偏好，**此步骤不可跳过**。
- 以下情况均视为对话结束：用户说「好了」「完成」「谢谢」等收尾语、用户输入 `/new`、任务交付并确认、用户无后续追问。
- **每完成一个独立任务后应立即调用一次**，防止会话中断导致记忆丢失。

### scope 规范

- 项目相关记忆：`scope: project`
- 跨项目通用经验（如 TypeScript 技巧、Electron 通用模式、React Native 通用方案）：`scope: user`
