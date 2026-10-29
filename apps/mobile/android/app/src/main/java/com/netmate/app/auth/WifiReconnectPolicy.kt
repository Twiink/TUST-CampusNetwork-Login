package com.netmate.app.auth

/**
 * WiFi 自动重连判定（纯函数，便于单元测试）。
 *
 * 语义对齐桌面端 reconnect-flow.ts 的三阶段流程，并按 Android 平台能力调整：
 * - 阶段 1：断开的 WiFi 本身重试「单个 WiFi 重试次数」次
 * - 阶段 2：按优先级（数字越小越优先）依次尝试其他开启了自动连接的 WiFi
 * - 阶段 3：全部失败后进入「冷却期」，冷却期内不再尝试，避免反复扫描耗电
 *
 * Android 10+ 普通应用不能强制连接 WiFi，只能通过 WifiNetworkSuggestion 向系统建议网络，
 * 由系统在信号可用时自行连接。因此「尝试连接」= 提交建议并等待系统连上，成功与否以随后的网络事件为准。
 */
object WifiReconnectPolicy {

    data class Candidate(val ssid: String, val password: String, val priority: Int, val id: String = ssid, val security: String? = null, val bssid: String? = null)

    data class Settings(
        val enabled: Boolean,
        val retriesPerWifi: Int,
        val cooldownMs: Long,
    )

    /** 计算本轮应尝试的 WiFi 顺序：断开的 WiFi 优先，其余按优先级 */
    fun plan(disconnectedSsid: String?, candidates: List<Candidate>, currentId: String? = null): List<Candidate> {
        val sorted = candidates.sortedBy { it.priority }
        if (disconnectedSsid == null) return sorted
        val disconnected = if (currentId != null) sorted.firstOrNull { it.id == currentId } else sorted.filter { it.ssid == disconnectedSsid }.singleOrNull()
        return listOfNotNull(disconnected) + sorted.filter { it.id != disconnected?.id }
    }

    /** 冷却期判定：上次全部失败的时间 + 冷却时长 之前不再尝试 */
    fun inCooldown(lastAllFailedAt: Long, cooldownMs: Long, now: Long): Boolean =
        lastAllFailedAt > 0 && cooldownMs > 0 && now - lastAllFailedAt < cooldownMs
}
