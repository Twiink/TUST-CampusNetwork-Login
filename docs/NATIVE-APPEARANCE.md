# 原生界面的视觉约定

适用版本：NetMate 2.0 原生替代分支，2026-10-29。用户要求保持原页面外观及白天、黑夜主题。原 React 页面和样式是视觉依据；原生实现使用系统控件及绘图，不引入浏览器运行时。

## 视觉依据

| 表面                 | 原始来源                                                           | 原生位置                                                                                                 |
| -------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 桌面框架、颜色、间距 | `apps/desktop/src/App.css`、`components/Sidebar.tsx`               | `apps/native-ui/src/netmate.css`、`windows/appearance.rs`、`apps/macos/Sources/NetMate/Appearance.swift` |
| 桌面状态与配置结构   | `apps/desktop/src/pages`、`components/settings`、`components/wifi` | GTK、Win32、AppKit 原生页面                                                                              |
| 手机主题与底部导航   | `apps/mobile/src/constants/theme.ts`、`components/BottomTab.tsx`   | `NetMateAppearance.kt`、`activity_main.xml`、`MainActivity.kt`                                           |
| 手机卡片和日志       | `components/home/HomeCards.tsx`、`screens/LogsScreen.tsx`          | 原生圆角卡片、RecyclerView、筛选和导出面板                                                               |

路径在表中未写全的组件均相对于对应的 `src` 目录。

## 布局与主题

桌面保留左侧 NetMate 品牌及“运行状态、配置设置、运行日志、关于”四项导航。侧栏内容宽 170，左右各 12；主内容间距 48。账号、WiFi、通用和通知选项归入配置设置。状态页保留网络、当前账号、WiFi 详情及心跳/恢复区域。Windows 在配置页内使用原生子导航，表单保留系统键盘操作和可访问名称。

手机保留“运行状态、配置设置、运行日志”三项底部导航。状态卡保留连接状态徽标与连接/注销动作，配置按账号、WiFi、通用、权限分组。日志工具栏紧凑排列，主体为虚拟列表；详细筛选放在面板中。关于及更新入口位于配置中。

| 令牌     | 白天                          | 黑夜                           |
| -------- | ----------------------------- | ------------------------------ |
| 背景     | `#f0f9ff → #e0f2fe → #dbeafe` | `#0f172a → #1e293b`            |
| 正文     | `#1e293b`                     | `#f1f5f9`                      |
| 强调色   | `#0ea5e9`                     | `#38bdf8`                      |
| 次要文字 | `#64748b`                     | 桌面 `#cbd5e1`，手机 `#94a3b8` |
| 卡片     | 半透明白色                    | 半透明 `#1e293b`               |

卡片圆角 24，按钮 16，输入 10–12；使用原界面指定的系统中文字体。日夜开关保留太阳/月亮、云和星星。透明效果通过原生色彩合成实现，装饰在重绘时绘制。Windows GDI 使用合成后的表面色；平台字体、输入控件和边框需在实际系统上逐项检查。

桌面没有保存选择时采用系统主题；Android 默认黑夜。主题偏好归界面所有，与后台网络配置分离。GTK/Win32 使用 `appearance-v1`，AppKit 使用应用 UserDefaults，Android 使用 `netmate_native_ui_v1`。主题切换直接更新视图；Android 保持 Activity 和 Binder 连接，四端保留当前页面及未提交的表单内容。

## 验证与交付状态

本轮只执行源码检查，不在本机构建、启动界面或执行 E2E。Rust 由 rustfmt 解析；Swift/Kotlin 使用独立语法解析器；Android XML 和工作流单独校验。这些检查不能确认平台类型检查、布局或最终像素。

CI 源码已加入两套主题、四个桌面页面/三个手机页面的截图，以及导航、主题持久化和输入保留回归。Linux/Windows 截图进入 `dist-native/visual`；macOS 截图进入 XCTest 的 `macos-ui.xcresult`；Android 截图由 instrumentation 导出。CI 尚未触发，截图尚未生成，视觉验收待完成。

验收时在相同主题和窗口尺寸下对照原页面，检查导航层级、卡片排列、长 SSID/账号/IPv6、空状态、错误、系统缩放与手机大字体。最终视觉确认后，重新测量完整进程树内存、启动和包体积。旧安装包不代表本轮界面。
