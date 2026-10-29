# NetMate 工作区约定

## 当前任务的执行边界

- 用户明确要求：本机不执行构建，也不执行 E2E。不要启动 Cargo/Gradle/Swift/Electron 构建、打包、模拟器或 UI 自动化来验证本轮改动。
- 可以执行单元测试和不产生产物的源码检查。优先使用 rustfmt、语法解析、XML/YAML 校验、actionlint 和纯脚本单元测试；不要把编译检查作为静态检查执行。
- 原生构建、实际渲染、日夜截图、原生 UI E2E、安装包与性能验收放在 CI 或专用验收环境。没有运行证据的项目必须标为待验证。
- 保持原页面外观和日夜主题。桌面视觉依据为 `apps/desktop/src/App.css`、`components/Sidebar.tsx` 及原页面组件；手机依据为 `apps/mobile/src/constants/theme.ts`、`components/BottomTab.tsx` 及原页面组件。原生重写保留这些布局、颜色、圆角与信息层级。
- 上述约定持续有效，直到用户明确修改。

## 基线与验收

- 保留重写前已有的未提交功能修复。可恢复基线为 `refs/codex/baselines/native-rewrite-20261029`；不要重置用户的工作区或暂存区。
- 默认产品路径为 Rust 独立后台与原生界面、Android Kotlin/Binder 服务。旧 Electron/RN 源码在原生验收通过前作为行为和视觉参考保留。
- 以 `docs/NATIVE-ACCEPTANCE.md`、`docs/NATIVE-APPEARANCE.md` 和 `docs/NATIVE-PERFORMANCE.md` 记录实现与证据。界面修改前生成的安装包和实测数字不能标为当前源码的验收结果。
- OpenViking 身份与范围遵循上级规则；无法确认手动 MCP 项目绑定时，保留脱敏的本地待同步结论，不向用户级写入项目事实。
