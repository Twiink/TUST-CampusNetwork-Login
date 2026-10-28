package com.netmate.app.auth

import android.content.Context
import org.json.JSONObject
import org.json.JSONArray
import com.netmate.app.logging.NetMateLogs

/**
 * WiFi 自动重连（三阶段，语义对齐桌面端 reconnect-flow.ts）：
 * 1. 断开的 WiFi 重试「单个 WiFi 重试次数」次
 * 2. 按优先级依次尝试其他开启了自动连接的 WiFi
 * 3. 全部失败：发送失败通知，进入「冷却期」，冷却期内不再尝试
 *
 * 每次「尝试」= 向系统提交连接（Android 10+ 为网络建议）并等待最多 [CONNECT_WAIT_MS]，
 * 等待目标 SSID 和地址就绪后才视为成功。
 *
 * 由 AutoAuthEngine 的串行线程调用；用户手动断开 WiFi 开关时不重连。
 */
internal class WifiReconnector(
    private val sleeper: (Long) -> Unit = { Thread.sleep(it) },
) {

    companion object {
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
    fun run(context: Context, profile: AutoAuthProfile, disconnectedSsid: String?, trigger: String, shouldContinue: () -> Boolean = { true }): Boolean {
        val state = WifiConnector.state(context)
        if (state.connected) return true
        if (!state.enabled) {
            // 用户关闭了 WiFi 开关：尊重用户选择，不重连
            NetMateLogs.log(context, "debug", "WiFi 已关闭，跳过自动重连")
            return false
        }

        val settings = WifiReconnectPolicy.Settings(
            enabled = profile.enabled,
            retriesPerWifi = profile.wifiRetries,
            cooldownMs = profile.wifiCooldownMinutes * 60_000L,
        )
        val now = System.currentTimeMillis()
        if (WifiReconnectPolicy.inCooldown(lastAllFailedAt, settings.cooldownMs, now)) {
            NetMateLogs.log(context, "debug", "WiFi 重连处于冷却期，跳过")
            return false
        }

        val candidates = profile.autoConnectWifis.map {
            WifiReconnectPolicy.Candidate(it.ssid, it.password, it.priority, it.id, it.security, it.bssid)
        }
        // 断开的 WiFi 未开启自动连接时，与桌面端一致：不触发重连
        if (disconnectedSsid != null && candidates.none { it.ssid == disconnectedSsid }) {
            NetMateLogs.log(context, "debug", "WiFi $disconnectedSsid 未开启自动连接，跳过")
            return false
        }
        val plan = WifiReconnectPolicy.plan(disconnectedSsid, candidates)
        if (plan.isEmpty()) return false

        NetMateLogs.log(context, "info", "开始 WiFi 自动重连（$trigger），候选 ${plan.size} 个")
        val failed = JSONArray()
        for (candidate in plan) {
            for (attempt in 1..settings.retriesPerWifi) {
                if (attempt > 1) sleeper(RETRY_GAP_MS)
                val current = AutoAuthStore.loadProfile(context)
                if (!shouldContinue() || !WifiConnector.state(context).enabled || current?.enabled != true || current.autoConnectWifis.none { it.id == candidate.id }) return false
                ReconnectEvents.publish(JSONObject().put("status", "connecting").put("ssid", candidate.ssid).put("attempt", attempt).put("maxAttempts", settings.retriesPerWifi))

                val accepted = try {
                    WifiConnector.connect(context, candidate.ssid, candidate.password, candidate.security, candidate.bssid, ruleId = candidate.id)
                } catch (e: Exception) {
                    NetMateLogs.log(context, "warn", "提交 WiFi 连接失败", "wifi")
                    false
                }
                if (accepted && waitForConnection(context, candidate, shouldContinue)) {
                    val connectedSsid = WifiConnector.state(context).ssid ?: candidate.ssid
                    lastAllFailedAt = 0L
                    EventNotifier.notify(
                        context,
                        EventNotifier.Kind.RECONNECT_SUCCESS,
                        "WiFi 已重新连接",
                        "已连接到 $connectedSsid",
                    )
                    ReconnectEvents.publish(JSONObject().put("status", "success").put("ssid", connectedSsid))
                    NetMateLogs.log(context, "success", "WiFi 已连接：$connectedSsid", "wifi")
                    return true
                }
            }
            failed.put(JSONObject().put("ssid", candidate.ssid).put("reason", "未在等待时间内连接目标网络"))
        }

        if (!shouldContinue()) return false
        NetMateLogs.log(context, "warn", "WiFi 自动重连失败：" + plan.joinToString("、") { it.ssid }, "wifi")
        ReconnectEvents.publish(JSONObject().put("status", "failed").put("failedList", failed))
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

    private fun waitForConnection(context: Context, target: WifiReconnectPolicy.Candidate, shouldContinue: () -> Boolean): Boolean {
        var waited = 0L
        while (waited < CONNECT_WAIT_MS) {
            val state = WifiEnvironment.snapshot(context)
            if (!shouldContinue() || !state.enabled || AutoAuthStore.loadProfile(context)?.let { it.enabled && it.autoConnectWifis.any { candidate -> candidate.id == target.id } } != true) return false
            if (state.connected && state.ssid == target.ssid && (target.bssid.isNullOrBlank() || WifiSecurity.bssid(state.bssid) == WifiSecurity.bssid(target.bssid)) && state.ipv4 != null) return true
            sleeper(POLL_MS)
            waited += POLL_MS
        }
        val state = WifiEnvironment.snapshot(context)
        return state.connected && state.ssid == target.ssid && (target.bssid.isNullOrBlank() || WifiSecurity.bssid(state.bssid) == WifiSecurity.bssid(target.bssid)) && state.ipv4 != null
    }
}
