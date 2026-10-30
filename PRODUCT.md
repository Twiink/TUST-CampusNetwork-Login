# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

天津科技大学的学生，在宿舍和教学楼使用校园网。装好后基本放着不管，由后台自动连接 WiFi、自动完成校园网认证。打开界面主要是三件事：看现在连没连上，偶尔改账号或 WiFi 配置，出问题时翻日志。

## Product Purpose

NetMate 负责校园网认证与 WiFi 连接管理：多账号顺序认证，按 WiFi 优先级重连，心跳检测断线，失败后冷却重试。成功的标准是用户不用想起它；需要看的时候，一眼就能知道网络状态和下一步该做什么。

## Operating Context

- 桌面端（Windows、macOS、Linux）使用侧栏导航，有四个页面：运行状态、配置设置、运行日志、关于。
- Android 使用底部导航。
- 关闭窗口后后台继续运行，平时通过托盘或菜单栏使用。
- 界面支持白天和黑夜主题，可随时切换。

## Capabilities and Constraints

- 原生界面：Win32、AppKit、GTK4、Android XML Views。后台为独立的 Rust agent，Android 为 Kotlin/Binder 服务。界面不含 JavaScript 运行时。
- 现有功能与性能优化必须保留，包括：日志分页与虚拟列表、首页签名避免重建、倒计时只更新文字、Android 软件绘制，以及保存操作串行化。
- 本机不执行构建和 E2E。原生渲染、截图和 UI 自动化在 CI 中验证。
- CI 冒烟测试依赖固定的可访问名称：网络连接状态、账号配置、搜索全部保留历史、检查更新、搜索 / 刷新。

## Brand Commitments

- 名称为 NetMate。
- 日夜切换按钮以 Elsht666/Button 的「按钮-全月」为准：发光太阳、飘移的云、满月滑块、闪烁的星星，悬停时放大。
- 用户确认整体采用天空主题，与切换按钮呼应。

## Evidence on Hand

- 原 React 页面：`apps/desktop/src`
- 原 RN 页面：`apps/mobile/src`
- 原生实现：`apps/native-ui/src`、`apps/macos`、`apps/mobile/android`

不得虚构用户数量、评价或性能数字。

## Product Principles

- 状态先行：打开界面的第一眼就能回答「连上了吗」。
- 安静可靠：平时不打扰，只在需要时给出明确的下一步。
- 重设计只改外观，不改功能和性能。
