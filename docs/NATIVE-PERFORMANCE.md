# NetMate 原生性能记录

记录日期：2026-10-29。正式发行门禁为桌面后台 ≤50 MiB、前台 ≤150 MiB；Android 后台 ≤60 MiB、前台 ≤100 MiB；桌面启动 P95 ≤1 秒、Android ≤1.5 秒；桌面稳定后台单核 CPU ≤0.2%；两小时稳定内存增长 ≤5 MiB。MiB = 1,048,576 字节。预算未因本轮移植而放宽。

## 远程验证

界面还原后的 [CI 40882814262](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/runs/40882814262)，源码 `91ebc07913dc9e66b710b525871cbcdd6d9dc43c`：

| 环境                            |               后台峰值 |               前台峰值 |       启动 P95 | 结论                                                   |
| ------------------------------- | ---------------------: | ---------------------: | -------------: | ------------------------------------------------------ |
| Ubuntu 26.04 x64 容器 / Xvfb    |           PSS 9.19 MiB |         PSS 106.71 MiB |       0.158 秒 | 短测通过                                               |
| Windows Server 2025 x64 CI      | Private Bytes 2.97 MiB | Private Bytes 5.42 MiB |       0.233 秒 | 短测通过；Windows 11 x64 实机待验收                    |
| Windows 11 ARM64 CI             | Private Bytes 3.34 MiB | Private Bytes 5.77 MiB |       0.261 秒 | 短测通过                                               |
| Android API 37 / Pixel 7 模拟器 |       总 PSS 31.38 MiB |       总 PSS 31.60 MiB |       1.267 秒 | 短测通过；ART 编译状态未控制                           |
| Ubuntu 26.04 ARM64 容器         |           通过后台预算 |       前台超过 150 MiB |         未继续 | 未通过；Cairo 路径仍初始化软件 GL 驱动，已修复待复测   |
| macOS 27 ARM64 CI               |         未取得有效结果 |         未取得有效结果 | 未取得有效结果 | ad-hoc 包误带受限 entitlement 被系统终止，已修复待复测 |

本表不代表整轮 CI 或四平台实机验收通过。该轮 Android 启动为 30 次冷进程启动，2 核、2 GiB、1080×2400、软件 GPU；完成配置加载和首次实际绘制后调用 `reportFullyDrawn()`。未控制 ART 编译状态的其他远程轮次曾超过 1.5 秒，不能忽略运行条件直接比较。

[Release 40888029593](https://github.com/Twiink/TUST-CampusNetwork-Login/actions/runs/40888029593) 对 `6daaded6a23efa48cc3a897e859a87385eed2c3d` 重新执行完整门禁；Android 明确安装 APK 随附 Baseline Profile 并用 `speed-profile` 编译后测冷进程启动。该条件不等于未编译的首次安装启动，必须连同报告的 `compilation` 字段解释。桌面前台采样同时校验首绘标记中的 UI 进程持续存活。最终发行产物和两小时结果待本轮完成后记录。

修复后的中间轮次 `6daaded`，同为 Release 40888029593：Linux x64 前台峰值 PSS 54,584,320 B（52.06 MiB）、ARM64 76,052,480 B（72.53 MiB），分别启动 P95 0.151 / 0.114 秒，两个架构短测均通过。该轮 Android 在采样时发生 Play 商店自更新和 dex2oat 争抢，P95 3510ms 未通过；不把失败排除出记录。后续 CI 改用同为 API 37 的 Google APIs 镜像，不含商店自更新任务，仍保留双核、2 GiB、1080×2400、软件 GPU 与原启动门槛，并在失败时保存 Perfetto 系统轨迹。该环境与原 Play 镜像需分别解释。

同一轮 macOS 27 ARM64 的 ad-hoc 包复验通过：后台 physical footprint 峰值 17,518,208 B（16.71 MiB）、前台 44,390,400 B（42.33 MiB）、RSS 分别 92,520,448 / 196,771,840 B，后台单核 CPU 0.0726%，启动 P95 0.497 秒。physical footprint 与 RSS 的区别如实保留，不互换口径。

Google APIs 专项 40891222278 仍失败，P95 4152ms；Perfetto 显示首帧约 1.96 秒，其中约 1.44 秒在 Ganesh 命令执行。当前 MainActivity 软件 Canvas 改动仅完成源码检查，需远程验证，不能列为已达标。

桌面关闭窗口释放 UI；Android 退到 Home 后仍存活的缓存 UI 进程全部计入后台 PSS。Windows 使用 Private Bytes/Working Set，macOS 使用 physical footprint/RSS，Linux 使用 PSS/RSS，不跨口径求和或比较百分比。Android `Graphics` 单列，已纳入 Android 统计的分配不重复相加；桌面 GPU 驱动/合成器分配尚未独立采集。

## 历史本机基线

以下是界面还原前的历史构建，仅作优化过程的参考。旧基线包含实施前未提交功能修复，不与新 CI 不同硬件的测量作严格百分比对比。本轮发布不在本机执行构建、UI、模拟器、E2E 或性能采样。

## 机器与方法

Linux：Ubuntu 26.04.1 LTS、x86_64、Linux 7.0.0-42、Intel i5-12600KF。使用正式优化构建、独立空配置、关闭调试器，统计相关进程 PSS、RSS 和单核 CPU 百分比；未主动连接或修改用户 WiFi。后台采样 600 秒。旧 Electron 基线先关闭窗口，再预热 150 秒，覆盖其原有的 120 秒隐藏销毁延迟，然后采样 60 秒。

旧基线包含实施前未提交的功能修复，快照为 `0b4d1f83ac33671608426c98e0cd3f6ca3c5747a`。历史原生后台 SHA-256：`225e7343f2218fc2ab36d5dc822dadb5ac5d28e46507b4e6628a55b99673ad0d`。原生 UI SHA-256：`7fbf9111c38898b88fa0a23c234a2566071e909b9bff620f48af6148a54d4e0d`。

## 历史测量

| 项目                 |                          含功能修复的旧基线 |             原生历史构建 | 限制                                               |
| -------------------- | ------------------------------------------: | -----------------------: | -------------------------------------------------- |
| Linux 后台峰值 PSS   |                  242,068,480 B / 230.85 MiB |   8,440,832 B / 8.05 MiB | 旧基线 60 秒，原生 600 秒；当前界面改动后待复测    |
| Linux 后台峰值 RSS   |                               566,657,024 B |             11,649,024 B | 不用 RSS 与 PSS 混算                               |
| Linux 后台 CPU       |                                单核 0.2063% |             单核 0.0146% | 独立空配置场景，非实际门户恢复压力                 |
| Linux 前台峰值 PSS   |                  321,282,048 B / 306.40 MiB | 25,455,616 B / 24.28 MiB | 原生前台部分时段与另一轮测量共享后台，只作诊断参考 |
| Linux 启动 P95       |                                      未采集 |          0.139 秒，30 次 | 配置加载后首绘；每次新配置，OS 页缓存未控制        |
| Linux DEB            |                               100,029,060 B |              3,669,922 B | 历史 x64 包；系统 GTK 依赖下载量未计入             |
| Android APK          | universal 62,220,919 B；x86_64 20,503,748 B |                468,233 B | 原生 Release 未签名，界面还原前生成                |
| Android 优化测试 APK |                                           — |                472,329 B | 调试证书签名的 benchmark 包，非正式发行签名        |
| Android 启动 P95     |                                      未采集 |          1,914 ms，30 次 | API 37 模拟器；超过 1.5 秒目标                     |

Linux 原始 JSON 均报告 SwapPss 为 0。GPU 分配尚未独立采集。Android 尚无正式的前后台完整进程合计 PSS 报告，不能依据单个 UI 进程的临时读数判定预算通过。Windows Private Bytes/Working Set、macOS physical footprint/RSS 及实机功耗均未采集。

本地原始记录位于被 Git 忽略的 `dist-native/`：`linux-final-background.json`、`linux-baseline-background.json`、`linux-baseline-foreground.json`、`linux-foreground.json`、`linux-startup.json`、`android-startup.json`。这些记录按历史构建 SHA 解释，不与当前源码混用。约 0.02 秒的 `agent-socket` 就绪时间仅表示 IPC 可用，不代表 UI 首次可交互。

## 测量边界

CI 使用 `measure.py`、`measure_desktop.py`、`measure_android.py` 收集完整相关进程，`startup.py` / `startup_android.py` 收集配置加载与首绘完成分布，`check_budget.py` 执行预算门禁。Release 的两小时阶段下载同一轮安装包，运行安装后的程序，不重新构建。原始 JSON、逐进程样本、截图和 stderr/logcat 保存在对应 Actions artifacts。

这些数字来自空配置与 CI 系统网络环境，不能代替真实校园门户、无线关联、权限撤回、设备睡眠与重启、反复恢复压力、实际 GPU 和耗电验收。Linux 安装包体积不包括系统 GTK、NetworkManager 等依赖下载量，该下载量尚未独立测量。
