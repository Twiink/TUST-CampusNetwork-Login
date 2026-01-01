# 更新日志 (CHANGELOG)

所有显著的变更都会记录在此文件。

本项目遵循[语义化版本控制](https://semver.org/lang/zh-CN/) (Semantic Versioning)。

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

*生成日期: 2026-01-01*
