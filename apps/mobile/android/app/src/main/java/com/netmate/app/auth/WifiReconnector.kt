package com.netmate.app.auth

import android.content.Context
import android.util.Log

/**
 * WiFi 自动重连（三阶段，语义对齐桌面端 reconnect-flow.ts）：
 * 1. 断开的 WiFi 重试「单个 WiFi 重试次数」次
 * 2. 按优先级依次尝试其他开启了自动连接的 WiFi
 * 3. 全部失败：发送失败通知，进入「冷却期」，冷却期内不再尝试
 *
 * 每次「尝试」= 向系统提交连接（Android 10+ 为网络建议）并等待最多 [CONNECT_WAIT_MS]，
 * 期间连上任一 WiFi 即视为成功（系统可能选择连接信号更好的另一个建议网络）。
 *
 * 由 AutoAuthEngine 的串行线程调用；用户手动断开 WiFi 开关时不重连。
 */
internal class WifiReconnector(
    private val sleeper: (Long) -> Unit = { Thread.sleep(it) },
) {

    companion object {
        private const val TAG = "WifiReconnector"
        private const val CONNECT_WAIT_MS = 15_000L
        private const val POLL_MS = 1_000L
        private const val RETRY_GAP_MS = 2_000L
    }

    /** 最近一次「全部失败」的时间（冷却期起点） */
    private var lastAllFailedAt = 0L

    fun resetCooldown() {
        lastAllFailedAt = 0L
    }

    /**
     * @param disconnectedSsid 刚断开的 WiFi；启动自动连接时为 null
     * @return 是否已连上 WiFi
     */
    fun run(context: Context, profile: AutoAuthProfile, disconnectedSsid: String?, trigger: String): Boolean {
        val state = WifiConnector.state(context)
        if (state.connected) return true
        if (!state.enabled) {
            // 用户关闭了 WiFi 开关：尊重用户选择，不重连
            Log.d(TAG, "WiFi 已关闭，跳过自动重连")
            return false
        }

        val settings = WifiReconnectPolicy.Settings(
            enabled = profile.enabled,
            retriesPerWifi = profile.wifiRetries,
            cooldownMs = profile.wifiCooldownMinutes * 60_000L,
        )
        val now = System.currentTimeMillis()
        if (WifiReconnectPolicy.inCooldown(lastAllFailedAt, settings.cooldownMs, now)) {
            Log.d(TAG, "WiFi 重连处于冷却期，跳过")
            return false
        }

        val candidates = profile.autoConnectWifis.map {
            WifiReconnectPolicy.Candidate(it.ssid, it.password, it.priority)
        }
        // 断开的 WiFi 未开启自动连接时，与桌面端一致：不触发重连
        if (disconnectedSsid != null && candidates.none { it.ssid == disconnectedSsid }) {
            Log.d(TAG, "WiFi $disconnectedSsid 未开启自动连接，跳过")
            return false
        }
        val plan = WifiReconnectPolicy.plan(disconnectedSsid, candidates)
        if (plan.isEmpty()) return false

        Log.i(TAG, "开始 WiFi 自动重连（$trigger），候选 ${plan.size} 个")
        for (candidate in plan) {
            for (attempt in 1..settings.retriesPerWifi) {
                if (attempt > 1) sleeper(RETRY_GAP_MS)
                if (!WifiConnector.state(context).enabled) return false

                val accepted = try {
                    WifiConnector.connect(context, candidate.ssid, candidate.password)
                } catch (e: Exception) {
                    Log.w(TAG, "提交 WiFi 连接失败: ${candidate.ssid}", e)
                    false
                }
                if (accepted && waitForConnection(context)) {
                    val connectedSsid = WifiConnector.state(context).ssid ?: candidate.ssid
                    lastAllFailedAt = 0L
                    EventNotifier.notify(
                        context,
                        EventNotifier.Kind.RECONNECT_SUCCESS,
                        "WiFi 已重新连接",
                        "已连接到 $connectedSsid",
                    )
                    return true
                }
            }
        }

        lastAllFailedAt = System.currentTimeMillis()
        val names = plan.joinToString("、") { it.ssid }
        val cooldownText = if (profile.wifiCooldownMinutes > 0) "，${profile.wifiCooldownMinutes} 分钟后再试" else ""
        EventNotifier.notify(
            context,
            EventNotifier.Kind.RECONNECT_FAILED,
            "WiFi 自动重连失败",
            "已尝试 $names，均未连上$cooldownText",
        )
        return false
    }

    private fun waitForConnection(context: Context): Boolean {
        var waited = 0L
        while (waited < CONNECT_WAIT_MS) {
            if (WifiConnector.state(context).connected) return true
            sleeper(POLL_MS)
            waited += POLL_MS
        }
        return WifiConnector.state(context).connected
    }
}
