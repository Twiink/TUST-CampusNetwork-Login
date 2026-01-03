# 更新日志 (CHANGELOG)

所有显著的变更都会记录在此文件。

本项目遵循[语义化版本控制](https://semver.org/lang/zh-CN/) (Semantic Versioning)。

---

## [未发布] - 2026-01-03

### 优化

#### 网络延迟测试策略重构
- 简化延迟测试逻辑，移除复杂的 WiFi 配置感知机制
- 采用简单可靠的 Baidu → Speedtest.cn 降级策略
- 移除了所有方法中的 `requiresAuth` 参数传递，提升代码可维护性
- 更新了技术文档 `docs/desktop-wifi-detection.md`，说明当前实现和未来规划
  - v1.0: 百度 + 测速网双重保障
  - v2.0: 计划支持多服务商和用户自定义测速目标

#### 代码质量提升
- **ESLint 完全通过**：修复所有包的 124 个 ESLint 问题（20 错误 + 104 警告）
  - `shared` 包: 0 错误, 0 警告 ✅
  - `desktop` 包: 0 错误, 0 警告 ✅
  - `mobile` 包: 0 错误, 0 警告 ✅（从 124 个问题降至 0）

#### TypeScript 类型系统优化
- 修复 React 类型版本冲突问题（monorepo 多版本类型定义冲突）
- 升级 desktop 包 React 到 18.3.1 版本
- 配置 `tsconfig.json` paths 强制使用本地类型定义
- 修复 `wifi-adapter.ts` GBK 编码类型断言
- 修复 `useNetwork.ts` 初始状态缺失 `wifiConnected` 属性

### 技术细节

#### ESLint 修复分类
1. **未使用的导入/变量** (17 处)
   - 移除: `mergeConfig`, `Appearance`, `Platform`, `Easing`, `GlassCard`, `NetworkStatus`, `RetryPolicyConfig`, `useColorScheme`, `withSpring` 等
   - 未使用参数添加下划线前缀: `_ssid`, `_password`

2. **React Hooks 警告** (5 处)
   - 为有意省略的依赖项添加 `eslint-disable-next-line react-hooks/exhaustive-deps`

3. **parseInt 缺少 radix** (3 处)
   - 统一使用 `parseInt(text, 10)`

4. **位运算符警告** (6 处)
   - 为颜色插值的必要位运算添加 `eslint-disable-next-line no-bitwise`

5. **React Native 内联样式** (97 处)
   - 为需要动态主题的文件添加文件级禁用注释
   - 说明原因：动态主题必须使用内联样式

#### 代码重构
- 重构 `HomeScreen.tsx` 的 `isDarkMode()` 函数（移除非法 Hook 调用）
- 重构 `getSignalIcon()` 和 `getLinkSpeedStatus()` 接收 `dark` 参数
- 更新 `WifiInfoCard` 组件直接使用 `useTheme()` Hook

### 文档更新
- ✅ `docs/desktop-wifi-detection.md` - 新增"问题 4：网络延迟测试策略"章节
- ✅ `CHANGELOG.md` - 本次更新日志

---

## [v1.0.0-beta] - 2026-01-01

> **状态**: 开发完成，待测试

这是 NetMate 的首个公开测试版本。

### 新增功能

#### 核心功能

- 多账户管理（添加、删除、切换账户）
- 服务商选择（校园网/移动/联通/电信）
- 服务器地址自定义配置
- 多 WiFi 配置管理
- WiFi 认证类型切换（需要/无需认证）
- WiFi 关联账号
- WiFi 优先级配置
- 手动登录/登出
- 自动登录（连接 WiFi 后自动认证）
- 心跳检测开关
- 检测间隔配置（默认 30 秒）
- 断线自动重连
- 重试策略（固定延迟/指数退避）
- 启动时 WiFi 检测
- 连接状态显示
- 无账户状态提示
- 网络信息显示
- 运行日志记录
- 日志级别筛选
- 系统通知
- 通知开关

#### 桌面端 (Windows/macOS)

- 系统托盘（图标状态、右键菜单）
- 开机自启
- 系统通知（登录成功/失败/掉线/重连）
- 后台运行（最小化到托盘）
- 自动更新 (electron-updater)

#### 移动端 (Android)

- WiFi 原生模块
- 后台服务 (Foreground Service)
- 开机自启 (BOOT_COMPLETED)
- 系统通知
- 应用内更新 (APK 下载安装)

### 技术栈

- **桌面端**: Electron + React + TypeScript + Vite
- **移动端**: React Native + TypeScript
- **共享层**: TypeScript (跨平台服务)
- **Android 原生**: Kotlin
- **构建工具**: pnpm + tsup

### 项目结构

```
NetMate/
├── apps/
│   ├── desktop/          # Electron 桌面应用 (Win/macOS)
│   └── mobile/           # React Native 移动应用 (Android)
├── packages/
│   └── shared/           # 共享核心业务包
├── docs/                 # 项目文档
└── shell/                # 参考脚本
```

### 已知问题

- iOS 暂不支持（后续版本考虑）
- Android 8.0+ 需要位置权限才能获取 WiFi SSID

### 待完成项

- [ ] 单元测试
- [ ] 真实网络环境测试
- [ ] 多账户切换测试
- [ ] 多 WiFi 匹配测试
- [ ] 性能测试（长时间运行）
- [ ] 用户文档

---

## 计划版本

### [v1.0.0] - 待定

第一个正式版本。

**计划内容**:

- [ ] 修复测试中发现的 Bug
- [ ] 补充单元测试
- [ ] 性能优化
- [ ] 完善用户文档

### [v1.1.0] - 待定

**计划内容**:

- [ ] iOS 支持（待 Android 稳定后）
- [ ] 跨设备配置同步（可选）
- [ ] 更多 UI 主题

---

## 如何贡献

如果你发现了 Bug 或有功能建议，请通过 [GitHub Issues](https://github.com/Twiink/TUST-Campusnet-Login/issues) 反馈。

---

## 感谢

感谢所有为这个项目提供反馈和建议的用户！

---

_生成日期: 2026-01-01_
