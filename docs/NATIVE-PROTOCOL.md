# NetMate 本地协议 v1

桌面协议定义：`packages/netmate-core/src/protocol.rs`。Android AIDL：`apps/mobile/android/app/src/main/aidl/com/netmate/app/ipc`。仅限应用本机、当前用户或应用私有进程间访问。

## 桌面

macOS/Linux 使用数据目录内 `agent.sock`；目录 0700、socket 0600，并验证对端用户。Windows 使用按用户数据目录区分的命名管道，拒绝远程客户端，DACL 仅允许所有者与 SYSTEM。后台启动锁防止重复实例。

帧为 4 字节大端长度和 UTF-8 JSON，单帧上限 2 MiB。请求与响应包含 `version: 1`、`id`。响应只有 `result` 或 `error`，错误字符串脱敏。没有通用命令执行接口。

```json
{
  "version": 1,
  "id": 1,
  "command": { "op": "logs", "args": { "limit": 200, "level": "warn", "keyword": "连接" } }
}
```

| 操作                                                   | 行为                                             |
| ------------------------------------------------------ | ------------------------------------------------ |
| `snapshot` / `subscribe`                               | 获取首次状态 / 接收状态变化；订阅断开立即释放    |
| `config` / `save_config`                               | 公开配置 / 以修订号校验的原子提交                |
| `scan` / `connect`                                     | 系统扫描 / 连接已保存规则 ID；扫描不阻塞控制队列 |
| `login` / `logout`                                     | 恢复认证 / 先暂停再注销，避免恢复引擎立即重登    |
| `retry` / `stop_recovery`                              | 立即恢复 / 取消当前轮次                          |
| `logs` / `clear_logs` / `export_logs`                  | 索引分页、清空代次、逐页写入文件                 |
| `update_check` / `update_status`                       | 验证签名清单 / 下载状态                          |
| `update_download` / `update_cancel` / `update_install` | 流式下载、取消、文件复核与系统安装入口           |
| `open_ui` / `quit`                                     | 按需打开或激活界面 / 完整退出                    |

状态包括配置修订号、完整网络身份、认证/外网分别状态、阶段、候选失败列表、下一次心跳/恢复时间、监听降级、日志修订与序列号。状态中没有密码。倒计时由可见控件本地计算，不产生每秒后台广播。

网络身份包括 SSID、BSSID、安全类型和 IPv4 地址。认证/探测返回前重新校验身份；配置变更或手动操作取消旧任务。Windows/macOS 不可取消的 OS 关联操作把串行锁持有到调用真正结束，避免新旧物理关联并发。

配置写入必须携带当前 `revision`，过期提交失败。密码采用 `passwordEdit`：`{"action":"keep"}`、`{"action":"clear"}` 或 `{"action":"replace","value":"..."}`。公开账号/规则只有 `hasPassword`。持久化桌面配置中密码为系统凭据引用。

日志查询支持 `level`、`source`、`keyword`、`startTime`、`endTime`、`cursor` 和 `limit`。返回 `entries`、`total`、`generation`、`nextCursor` 和 `hasMore`；`total` 不受页游标影响。游标包含清空代次，清空后旧游标失效。单页限制条数及总字节，完整导出不把全历史装入内存。

## Android

`INetwork.request` 接受 `{"version":1,"op":"...","args":{...}}`；异步 `IResult.complete` 返回 `result`/`error`。`IEvents.changed` 推送无密码快照。只有 `:network` 进程实例化配置、恢复与更新所有者；Activity 只持公开投影。

界面停止可见时注销监听、解绑 Binder、清空列表和页面引用；系统缓存的界面进程仍计入性能统计。扫描、日志/更新 IO 与配置/手动操作使用各自有界队列。Android `connect` 只表示系统接受连接意图，等待系统选择与实际连接状态分别呈现。

## 更新元数据

编译时配置 HTTPS `NETMATE_UPDATE_ENDPOINT` 与原始 Ed25519 公钥的 Base64 `NETMATE_UPDATE_PUBLIC_KEY`。清单是数组，每个条目包含 `version`、`platform`、`arch`、`url`、`length`、`sha256`、`signature`。

签名正文为前六个字段按此顺序以换行连接的 UTF-8 字节。平台为 `windows`、`macos`、`linux`、`android`；桌面架构为 `x86_64` 或 `aarch64`，Android 为 `universal`。Linux 按系统包管理器选择 DEB/RPM。安装前再次按长度和 SHA-256 流式验证；Android 还检查包身份、版本与证书谱系。发布私钥只参与元数据制作，不进入应用。
