# NetMate 原生性能记录

记录日期：2026-10-29。以下数据来自界面还原前的历史构建。用户随后要求本机不执行构建和 E2E，并保持原页面及日夜主题；当前界面源码已继续修改，尚无对应的新构建、截图和性能数据。历史数字用于说明优化方向，不构成当前版本的验收结论。

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

## 当前验收状态

本轮没有重新构建或重测。界面还原后的四平台数据、两小时稳定性、100 次 UI 生命周期、真实网卡/校园门户、安装更新、自启和权限撤回均待 CI 或专用设备验证。两小时稳定增长目标仍为不超过 5 MiB，不延长心跳或减少统计进程来达标。

CI 使用 `measure.py`、`measure_desktop.py`、`measure_android.py` 收集完整相关进程，`startup.py` / `startup_android.py` 收集配置加载与首绘完成分布，`check_budget.py` 执行预算门禁。验收报告必须附系统、硬件、签名/构建版本、二进制摘要、采样场景、测量口径、进程明细和 GPU 单列数据。当前工作区不运行这些构建及 UI 测量步骤。
