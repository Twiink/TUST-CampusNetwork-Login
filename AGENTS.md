# AGENTS.md

本文件定义了仓库的协作规则、需求规格和质量标准，适用于所有参与开发的人类与 AI Agent。

---

## 项目结构与模块组织

pnpm workspace monorepo，三个代码区域：

- `apps/desktop`: Electron + React 桌面端。UI 在 `src/`，Electron 入口在 `electron/`，打包资源在 `public/` 和 `build/`。
- `apps/mobile`: React Native 移动端。应用代码在 `src/`，原生代码在 `android/` 和 `ios/`。
- `packages/shared`: 跨平台共享 TypeScript 业务逻辑，用 tsup 编译到 `dist/`。

辅助脚本在 `shell/`。**禁止手动编辑** `dist/`、`dist-electron/`、`packages/shared/dist/` 中的生成产物。

---

## 构建、测试与开发命令

```bash
pnpm install              # 安装所有依赖
pnpm dev:desktop          # 桌面端 Vite 开发模式
pnpm dev:mobile           # 移动端 Metro + shared watch
pnpm android              # 启动 Android 应用

pnpm build                # 构建 shared + desktop
pnpm dist / dist:mac / dist:win / dist:linux  # 打包发布

# 质量门禁（PR 合入前必须全部通过）
pnpm lint                 # ESLint (--max-warnings=0)
pnpm type-check           # TypeScript noEmit 检查
pnpm test                 # 运行全部测试
pnpm format:check         # Prettier 格式检查
```

---

## 编码风格与命名约定

- TypeScript-first，Prettier 格式化：2 空格缩进、分号、单引号、100 字符行宽、LF 换行。
- React 组件/页面用 `PascalCase`（`HomeScreen.tsx`、`Settings.tsx`）。
- Hook 用 `useXxx.ts`。
- Shared 服务用描述性名词（`AuthService`、`WifiManager`）。
- 未使用参数加 `_` 前缀。
- 源码注释和文档使用**中文**。

---

##  功能需求规格

### REQ-01: WiFi 配置与记录

| 项目 | 要求 |
|------|------|
| WiFi 类型 | 支持两类：需要校园网门户认证的、不需要的 |
| 匹配策略 | SSID 为主，`security` + `BSSID` 辅助精确匹配，避免同名误判 |
| 未记录 WiFi | 仅提示是否添加记录，不主动切换或干预 |
| 不支持 | 隐藏 SSID、企业级 802.1X |

### REQ-02: WiFi 密码管理

- 应用存储 WiFi 连接密码（WPA/WPA2），实现真正首连能力。
- 桌面端 `safeStorage` 加密；移动端安全存储方案。
- **Windows 端必须由应用内生成 WiFi profile 实现首连**，不依赖系统已保存 profile。

### REQ-03: WiFi 数据模型

```typescript
interface WifiConfig {
  // ... 现有字段
  password: string;                 // 新增：WiFi 连接密码（加密存储）
  linkedAccountIds: string[];       // 变更：从 linkedAccountId 改为数组
  lastConnectedAt: number | null;   // 新增：最近成功连接时间戳
}
```

### REQ-04: 启动与首页状态

| 场景 | 行为 |
|------|------|
| 未连接 WiFi | 首页进入"未连接"状态，可手动连接已记录 WiFi |
| 启动时自动连接 | 可配置开关，默认**关闭** |
| 保持当前连接 | 可配置开关，默认**开启**（不切换到更高优先级） |
| 信息展示 | SSID、信号、延迟、速度、频段、IP、网关、DNS、BSSID、信道、安全类型 |
| 状态分级 | 按 连接状态 / 是否已记录 / 是否需认证 / 是否已绑定账户 分阶段提示 |

### REQ-05: WiFi 连接与切换

- 优先级：数字越小越高；同优先级按 `lastConnectedAt` 降序。
- 手动切换仅作为"本次会话首选重连目标"，不改写长期优先级。
- 手动切换失败：回退原 WiFi → 若回退也失败 → 进入自动策略。
- **手动切换必须立即中断正在进行的自动重连。**

### REQ-06: 断线重连策略

```
WiFi 断开
  → 重试刚断开的 WiFi（用户配置重试次数，默认 3）
  → 失败后进入冷却期（用户配置时长，默认 5 分钟）
  → 按优先级尝试其他已记录 WiFi
  → 全部失败 → 冷却 → 从头轮询（最多 3 轮）
  → 停止自动重连，等待用户操作
```

### REQ-07: 心跳与认证

- 心跳默认**开启**，可关闭。
- 用户配置：心跳间隔、连续失败阈值（默认 2-3 次）。
- 失败区分：
  - WiFi 仍连接 + 认证/网络失效 → 自动重新认证
  - WiFi 已断开 → 进入 WiFi 重连流程
- 无需认证的 WiFi 心跳失败后尝试重连 WiFi，不立刻切换。
- 认证优先使用 WiFi 绑定账号，非全局当前账号。

### REQ-08: 多账号认证

- 支持多运营商账号（移动、联通、电信、教育网）。
- 一个 WiFi 可绑定多个账号（`linkedAccountIds`）。
- 认证按绑定顺序依次尝试，全部失败后才判定认证失败。

### REQ-09: 应用设置模型

必须包含的可配置项：

| 设置项 | 默认值 |
|--------|--------|
| 心跳检测开关 | 开启 |
| 心跳间隔 | 30s |
| 连续失败阈值 | 3 次 |
| 单个 WiFi 重试次数 | 3 次 |
| 冷却期时长 | 5 分钟 |
| 启动时自动连接 | 关闭 |
| 保持当前连接 | 开启 |
| 各通知场景独立开关 | 见 REQ-12 |

### REQ-10: 后台与开机行为

- **Android**：后台继续心跳和自动重连；开机自启并执行连接/重连；需权限引导闭环（前台服务、开机自启、定位/WiFi 权限、电池优化白名单）。
- **桌面端**：关窗缩到托盘，心跳和重连不中断。

### REQ-11: WiFi 配置导入/导出

- 导出为文件（含 WiFi 配置和账号绑定关系）。
- 从文件导入，支持跨设备迁移和备份恢复。

### REQ-12: 通知策略

每种场景独立开关，无全局统一开关：

| 通知场景 | 默认 |
|----------|------|
| WiFi 断开 | 开启 |
| 自动重连成功 | 开启 |
| 自动重连全部失败 | 开启 |
| 认证失效并自动重新认证 | 开启 |

### REQ-13: 自动更新

- 桌面端：完整"检查更新 → 下载 → 安装"闭环。
- 移动端：版本检查与更新引导。

---

## 测试策略

### 测试金字塔

```
        ┌─────────┐
        │  E2E    │  少量关键流程
        ├─────────┤
      │ Integration │  跨模块协作
      ├─────────────┤
    │  Component     │  UI 组件行为
    ├────────────────┤
  │    Unit Tests      │  shared 包全部服务
  └────────────────────┘
```

### 1. 单元测试 (Unit Tests)

**范围**：`packages/shared` 全部服务和工具函数

**必须覆盖**：

| 模块 | 关键测试点 |
|------|-----------|
| `ConfigManager` | 加载/验证/合并默认值/重置 |
| `AccountManager` | 多账户 CRUD、当前账户切换、首账户自动设为当前 |
| `WifiManager` | SSID+BSSID+security 匹配、优先级排序、`lastConnectedAt` 排序、`linkedAccountIds` 多账号绑定 |
| `AuthService` | 请求构造、运营商后缀、JSONP 解析（成功/失败/已在线）、多账号依次尝试 |
| `NetworkDetector` | 连通性结果解析、认证状态判断、心跳失败场景区分 |
| `RetryPolicy` | 固定退避/指数退避/冷却期计算/最大轮数限制 |
| `Logger` | 级别筛选、条数上限(500)、7天过期清理、文本/JSON导出 |
| 导入/导出 | 序列化/反序列化/数据校验/版本兼容 |

**工具**：Vitest
**命名**：`*.test.ts`，与被测文件同目录或 `__tests__/` 子目录
**运行**：`pnpm test:shared`

### 2. 组件测试 (Component Tests)

**范围**：桌面端 React 组件、移动端 React Native 组件

**必须覆盖**：
- Home 页 4 种状态切换：未连接 / 已连接未记录 / 已记录未认证 / 已认证
- Settings 页：账户列表渲染、WiFi 配置表单校验、多账号绑定 UI
- 心跳倒计时与重连进度展示
- 各通知场景开关独立控制

**工具**：
- 桌面端：Vitest + React Testing Library
- 移动端：Jest + React Native Testing Library

### 3. 集成测试 (Integration Tests)

**范围**：跨模块协作流程

**必须覆盖的链路**：
- 完整登录链路：选择账号 → 构造请求 → 解析响应 → 更新状态
- WiFi 匹配链路：检测 SSID → 精确匹配配置 → 判断是否需认证 → 选择绑定账号
- 断线重连状态机：WiFi 断开 → 重试 → 冷却 → 按优先级切换 → 全部失败停止
- 心跳检测链路：定时检测 → 连续失败 → 区分 WiFi 断开 vs 认证失效 → 触发恢复
- 导入/导出闭环：导出 → 导入 → 验证完整性
- 手动切换中断自动重连

**工具**：Vitest（mock 平台 API）

### 4. IPC/桥接测试

**范围**：Electron IPC 通道、React Native 原生桥接

**必须覆盖**：
- 所有 IPC channel 的请求/响应契约
- preload API 完整性
- 错误处理：无效参数、超时、主进程异常
- React Native 原生模块返回值格式

### 5. E2E 测试 (End-to-End Tests)

**范围**：桌面端关键用户流程

**必须覆盖**：
- 首次启动 → 添加账户 → 添加 WiFi → 手动登录 → 登出
- WiFi 配置导入/导出完整流程
- 设置项修改并持久化验证
- 关于页更新检查交互

**工具**：Playwright（Electron 模式）
**运行**：`pnpm test:e2e`

### 6. 平台特定测试

| 平台 | 测试重点 |
|------|---------|
| Windows | WiFi profile 生成与首连 |
| macOS | WiFi 检测/切换 shell 命令 |
| Android | 原生模块桥接（WifiModule、BackgroundService、BootReceiver） |

---

## 测试规则（强制执行）

1. **新功能必须附带测试**：PR 中新增功能代码必须同时包含对应测试，无测试的功能 PR 不予合入。
2. **Bug 修复必须有回归测试**：先写失败测试复现 bug，再修复使其通过。
3. **shared 包覆盖率目标**：语句覆盖 >= 80%，分支覆盖 >= 70%。
4. **测试隔离**：不依赖真实网络或 WiFi 硬件，网络请求和系统操作通过 mock/stub 隔离。
5. **测试命名**：使用中文描述意图，如 `it('当所有绑定账号认证失败时应判定 WiFi 认证失败')`。
6. **CI 门禁**：`pnpm lint && pnpm type-check && pnpm test` 全部通过是合入前提。

---

## 提交规则

- 提交信息使用**中文**，内容简洁明确，含 scope 前缀：`desktop: 修复托盘重连状态` / `shared: 添加 WiFi 多账号绑定`。
- **每次**完成任何代码修改后，必须使用 `git add .` 暂存所有变更，再用中文 `git commit -m "提交信息"` 提交。
- 除非用户明确要求仅暂存不提交，否则 AI Agent 不得跳过上述 `git add .` 与中文提交步骤，也不得只暂存部分文件。
- **禁止**在 commit message 中保留任何 AI 协作者尾注，包括但不限于：
  - `Co-Authored-By: Claude ...`
  - `Co-Authored-By: Anthropic ...`
  - 其他 AI 模型/厂商自动追加的 attribution
- commit author 只保留真实人类维护者，**不允许 GitHub 贡献者列表中出现 AI 人员**。
- 仓库内置 `.githooks/commit-msg` 钩子，提交时自动移除常见 AI co-author 尾注。
- 如本地未启用钩子，请执行：`git config core.hooksPath .githooks`。

### 禁止的 Git 操作

以下操作**严格禁止** AI Agent 执行，必须由用户手动操作：

- `git push`（包括 `--force`、`-u` 等所有变体）
- `git pull` / `git fetch`
- `gh pr create` / `gh pr merge` 及所有 GitHub CLI 远程操作
- `git remote` 相关修改
- 任何涉及远程仓库交互的命令

AI Agent 的 Git 操作范围**仅限于本地**：`git add`、`git commit`、`git status`、`git diff`、`git log`、`git branch`、`git checkout`、`git stash` 等。

## PR 规范

- PR 必须包含：影响范围、验证命令、截图/录屏（UI 变更时）。
- 涉及密码处理、权限变更、重连/认证行为时必须在 PR 中显式说明。

## 安全与配置

- **禁止提交**校园网凭据、token、机器特定配置。
- 密钥存储在本地设备存储中。
- PR 中涉及新配置项或平台权限变更时必须说明。

---

## 当前已知未闭环项

以下是代码中已有入口但尚未完成闭环的能力，后续开发应优先补齐：

### 桌面端
- Settings 页 `autoLaunch`/`showNotification` 切换未调用专门的 IPC。
- preload 事件白名单缺少 `event:wifi:reconnectProgress` 和 `event:wifi:allReconnectsFailed`。
- About 页版本号硬编码 `0.0.0`，GitHub 链接为占位值。
- 自动更新前端仅有检查，缺少下载/安装交互。

### 移动端
- `MobileWifiAdapter` 的 `connect`/`disconnect`/`scan` 未实现。
- `useHeartbeat`/`useAutoReconnect` Hook 未接入主流程。
- Android `BackgroundService` 未接入 JS 层心跳逻辑。
- 通知仅用 `Alert` 模拟，非真实本地通知。
- `AppUpdater` owner 为占位值，版本号硬编码。
- 后台服务、自启模块与 WiFi 重连/认证重连/心跳未形成完整联动。
- 权限请求接口存在但无明确的用户引导闭环。

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
