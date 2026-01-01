# 端口检查与清理工具使用说明

| 脚本文件 | 支持平台 |
|----------|----------|
| `check-ports.sh` | macOS / Linux |
| `check-ports.bat` | Windows (CMD/PowerShell) |

---

## 功能特性

1. **端口占用检测**：检查指定端口是否有进程监听
2. **进程信息展示**：显示占用端口的进程详细信息（PID、命令、用户等）
3. **进程终止**：可选地终止占用端口的进程
4. **端口保护**：支持设置保护端口，防止误杀重要进程
5. **单端口检查**：支持检查单个指定端口
6. **彩色输出**：使用颜色区分不同状态信息

---

## 默认端口列表

脚本默认检查以下常用端口：

| 端口 | 用途说明 |
|------|----------|
| 80   | HTTP 反向代理/服务器 (nginx, apache) |
| 443  | HTTPS 反向代理/服务器 |
| 8080 | 应用 HTTP (Spring Boot, Tomcat, 开发服务器) |
| 8843 | 非标准 HTTPS/管理控制台 |
| 3000 | 前端开发服务器 (React, Next.js) |
| 5173 | Vite 默认开发服务器 |
| 8000 | 后端开发 (Django, FastAPI, Uvicorn) |
| 9000 | 运维/中间件 (Portainer, 管理工具) |
| 5432 | PostgreSQL 数据库 |
| 3306 | MySQL / MariaDB 数据库 |
| 6379 | Redis 缓存 |
| 27017 | MongoDB 数据库 |
| 8081 | 备用 HTTP/次级实例 |
| 7001 | Java 管理/WebLogic |
| 5000 | 后端开发 (Flask, 本地 API) |

---

## 使用方法

### macOS / Linux

```bash
./check-ports.sh [选项]
```

### Windows (CMD 或 PowerShell)

```cmd
check-ports.bat [选项]
```

### 命令行参数（跨平台通用）

| 参数 | 说明 |
|------|------|
| `--kill` | 启用终止模式，终止占用端口的进程 |
| `--kill=端口` | 只检查并终止指定端口的进程 |
| `--protect=端口1,端口2,...` | 设置保护端口列表（逗号分隔） |
| `--force-protected` | 强制终止被保护的端口（危险） |

---

## 使用模式详解

### 模式 1：仅检查模式（默认）

**最安全的模式**，只检查端口占用情况，不执行任何终止操作。

**macOS/Linux:**
```bash
./check-ports.sh
```

**Windows:**
```cmd
check-ports.bat
```

输出示例：
```
========================================
Windows Port Checker
========================================

Ports to check:
80 443 8080 8843 3000 5173 ...

Protected ports: (none)
Mode: CHECK ONLY

[OK]   Port 80 is free
[BUSY] Port 3000 is in use. PID(s)= 12345
    Process info (PID=12345):
      Image Name:     node.exe
      PID:            12345
      ...
========================================
Done
========================================
```

---

### 模式 2：终止模式 - 默认端口列表

检查并终止占用默认端口列表中所有端口的进程。

**macOS/Linux:**
```bash
./check-ports.sh --kill
```

**Windows:**
```cmd
check-ports.bat --kill
```

---

### 模式 3：终止模式 - 单个端口

只检查并终止指定端口的进程。

**macOS/Linux:**
```bash
./check-ports.sh --kill=3000
```

**Windows:**
```cmd
check-ports.bat --kill=3000
```

---

### 模式 4：端口保护模式

检查并终止进程，但保护指定端口不被终止。

**macOS/Linux:**
```bash
./check-ports.sh --kill --protect=3000,5173,8000
```

**Windows:**
```cmd
check-ports.bat --kill --protect=3000,5173,8000
```

当尝试终止被保护的端口时：
```
[SKIP] Port 3000 is protected. Not killing PID 12345.
       Use --force-protected to override.
```

---

### 模式 5：强制终止保护端口

**危险操作**：强制终止所有进程，包括被保护的端口。

**macOS/Linux:**
```bash
./check-ports.sh --kill --protect=3000,5173 --force-protected
```

**Windows:**
```cmd
check-ports.bat --kill --protect=3000,5173 --force-protected
```

---

## 工作原理

### macOS / Linux 版本 (check-ports.sh)

#### 1. 端口检测机制

使用 `lsof` 命令查找监听指定 TCP 端口的进程：

```bash
lsof -nP -iTCP:"端口" -sTCP:LISTEN
```

参数说明：
- `-n`：不进行 DNS 反向解析（加快速度）
- `-P`：不显示服务名称（直接显示端口号）
- `-iTCP:端口`：过滤 TCP 端口
- `-sTCP:LISTEN`：只显示监听状态的进程

#### 2. 进程终止机制

采用**两步策略**：

```bash
# 第一步：发送 TERM 信号（优雅退出）
kill -TERM $PID
sleep 0.2

# 第二步：如果进程仍在运行，发送 KILL 信号（强制终止）
kill -KILL $PID
```

#### 3. 依赖工具

| 工具 | 用途 |
|------|------|
| `lsof` | 列出打开的文件（包括网络端口） |
| `ps` | 显示进程信息 |
| `kill` | 发送信号给进程 |

---

### Windows 版本 (check-ports.bat)

#### 1. 端口检测机制

使用 `netstat` 命令查找监听指定 TCP 端口的进程：

```cmd
netstat -ano -p tcp | findstr /R /C:":端口 .*LISTENING"
```

参数说明：
- `-a`：显示所有连接和监听端口
- `-n`：以数字形式显示地址和端口（不解析 DNS）
- `-o`：显示每个连接的进程 ID (PID)
- `-p tcp`：只显示 TCP 连接
- `findstr`：过滤 LISTENING 状态的行

#### 2. 进程信息展示

使用 `tasklist` 命令获取进程详情：

```cmd
tasklist /FI "PID eq 1234" /FO LIST
```

参数说明：
- `/FI "PID eq 1234"`：过滤指定 PID
- `/FO LIST`：以列表格式输出

#### 3. 进程终止机制

使用 `taskkill` 命令强制终止进程：

```cmd
taskkill /PID 1234 /F
```

参数说明：
- `/PID 1234`：指定要终止的进程 ID
- `/F`：强制终止进程（不等待确认）

#### 4. 依赖工具

| 工具 | 用途 |
|------|------|
| `netstat` | 显示网络连接和端口状态 |
| `tasklist` | 显示运行中的进程列表 |
| `taskkill` | 终止指定的进程 |
| `findstr` | 文本搜索/过滤（类似 grep） |

#### 5. PowerShell 彩色输出

批处理脚本通过调用 PowerShell 实现彩色输出：

```cmd
powershell -NoProfile -Command "Write-Host '消息' -ForegroundColor 颜色"
```

---

## 输出状态说明

| 状态 | 颜色 | 含义 |
|------|------|------|
| `[OK]` | 绿色 | 端口未被占用 |
| `[BUSY]` | 红色 | 端口被占用 |
| `[KILLED]` | 绿色 | 进程已成功终止 |
| `[SKIP]` | 黄色 | 跳过保护的端口 |
| `[FAIL]` | 红色 | 终止失败（可能需要管理员权限） |
| `[WARN]` | 黄色 | 警告信息 |

---

## 使用场景示例

### 场景 1：开发前环境检查

启动新项目前，检查端口是否被占用。

**macOS/Linux:**
```bash
./check-ports.sh
```

**Windows:**
```cmd
check-ports.bat
```

---

### 场景 2：快速清理开发环境

关闭所有开发服务器和数据库。

**macOS/Linux:**
```bash
./check-ports.sh --kill
```

**Windows:**
```cmd
check-ports.bat --kill
```

---

### 场景 3：只清理前端开发服务器

只清理 3000 和 5173 端口。

**macOS/Linux:**
```bash
./check-ports.sh --kill=3000
./check-ports.sh --kill=5173
```

**Windows:**
```cmd
check-ports.bat --kill=3000
check-ports.bat --kill=5173
```

---

### 场景 4：保护数据库，清理其他服务

保留数据库运行，只清理应用服务。

**macOS/Linux:**
```bash
./check-ports.sh --kill --protect=5432,3306,6379,27017
```

**Windows:**
```cmd
check-ports.bat --kill --protect=5432,3306,6379,27017
```

---

### 场景 5：检查特定端口

只检查 8080 端口。

**macOS/Linux:**
```bash
./check-ports.sh --kill=8080
```

**Windows:**
```cmd
check-ports.bat --kill=8080
```

---

## 注意事项

### 安全建议

1. **默认使用仅检查模式**：不确定时，先不加 `--kill` 参数查看情况
2. **保护重要端口**：生产环境的数据库、重要服务应添加到保护列表
3. **谨慎使用 `--force-protected`**：此参数会绕过所有保护
4. **备份数据**：终止数据库进程前确保数据已保存

### 权限要求

#### macOS / Linux
- 普通用户可以终止自己的进程
- 终止其他用户的进程可能需要 `sudo` 权限

#### Windows
- 终止某些系统进程或管理员启动的进程需要**以管理员身份运行**
- 右键点击 `check-ports.bat`，选择"以管理员身份运行"

### 常见问题

**Q: 为什么有些进程无法终止？**

A: 可能原因：
- macOS/Linux: 进程属于其他用户，需要 `sudo` 权限
- Windows: 需要管理员权限运行脚本
- 进程是系统关键进程，拒绝终止
- 进程在检查期间已退出

---

**Q: 终止后端口仍显示被占用？**

A: 可能原因：
- 进程正在优雅退出中，等待几秒后再次检查
- 有新的进程自动启动并占用了端口
- 端口被系统服务占用

---

**Q: 可以修改默认端口列表吗？**

A: 可以。

**macOS/Linux** - 编辑 `check-ports.sh`：
```bash
DEFAULT_PORTS=(80 443 8080 你的端口1 你的端口2)
```

**Windows** - 编辑 `check-ports.bat`：
```cmd
set "DEFAULT_PORTS=80 443 8080 你的端口1 你的端口2"
```

---

## 技术细节对比

| 特性 | macOS/Linux (check-ports.sh) | Windows (check-ports.bat) |
|------|------------------------------|---------------------------|
| 端口检测 | `lsof -nP -iTCP:端口 -sTCP:LISTEN` | `netstat -ano -p tcp \| findstr` |
| 进程信息 | `ps -p PID -o pid,ppid,user,comm,args` | `tasklist /FI "PID eq xxx" /FO LIST` |
| 进程终止 | `kill -TERM` → `kill -KILL`（两步） | `taskkill /PID xxx /F`（强制） |
| 彩色输出 | ANSI 转义码 | 调用 PowerShell Write-Host |
| PID 去重 | `sort -u` | 空格分隔列表 + findstr |
| 变量展开 | Bash 参数扩展 | EnableDelayedExpansion |
| 函数定义 | `function_name() { }` | `:FUNCTION_LABEL` ... `exit /b` |

---

## 扩展与定制

### 修改默认端口列表

**macOS/Linux** - 编辑 `shell/check-ports.sh`，找到第 59 行：
```bash
DEFAULT_PORTS=(80 443 8080 8843 3000 5173 8000 9000 5432 3306 6379 27017 8081 7001 5000)
```

**Windows** - 编辑 `shell/check-ports.bat`，找到第 58 行：
```cmd
set "DEFAULT_PORTS=80 443 8080 8843 3000 5173 8000 9000 5432 3306 6379 27017 8081 7001 5000"
```

### 添加快捷命令（可选）

**macOS/Linux** - 添加到 `~/.bashrc` 或 `~/.zshrc`：
```bash
alias ports='~/path/to/check-ports.sh'
alias portsk='~/path/to/check-ports.sh --kill'
alias ports3='~/path/to/check-ports.sh --kill=3000'
```

**Windows** - 创建别名或添加到 PATH：
1. 将 `shell` 目录添加到系统 PATH
2. 直接运行：`check-ports.bat --kill`

---

## 完整示例：日常开发工作流

### macOS / Linux

```bash
# 1. 开始工作前检查端口
./check-ports.sh

# 2. 清理所有开发环境（除了数据库）
./check-ports.sh --kill --protect=5432,3306,6379,27017

# 3. 启动你的服务
npm run dev

# 4. 工作结束，检查特定端口
./check-ports.sh --kill=3000

# 5. 完全清理
./check-ports.sh --kill
```

### Windows

```cmd
REM 1. 开始工作前检查端口
check-ports.bat

REM 2. 清理所有开发环境（除了数据库）
check-ports.bat --kill --protect=5432,3306,6379,27017

REM 3. 启动你的服务
npm run dev

REM 4. 工作结束，检查特定端口
check-ports.bat --kill=3000

REM 5. 完全清理
check-ports.bat --kill
```

---

## 许可与贡献

此脚本是 NetMate 项目的辅助工具，用于简化开发环境管理。

如有问题或建议，请在项目中提出 Issue。
