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
internal data class WifiVerification(val online: Boolean, val authenticated: Boolean = false, val reason: String = "互联网不可达", val retryable: Boolean = false)

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
    fun run(context: Context, profile: AutoAuthProfile, disconnectedSsid: String?, trigger: String, verify: ((AutoAuthWifiRule, (String) -> Unit) -> WifiVerification)? = null, startup: Boolean = false, previousWifiId: String? = null, shouldContinue: () -> Boolean = { true }): Boolean {
        val state = WifiConnector.state(context)
        if (state.connected && verify == null) return true
        if (!state.enabled) {
            // 用户关闭了 WiFi 开关：尊重用户选择，不重连
            NetMateLogs.log(context, "debug", "WiFi 已关闭，跳过自动重连")
            return false
        }

        val settings = WifiReconnectPolicy.Settings(
            enabled = profile.enabled || startup,
            retriesPerWifi = profile.wifiRetries,
            cooldownMs = profile.wifiCooldownMinutes * 60_000L,
        )
        val now = System.currentTimeMillis()
        if (WifiReconnectPolicy.inCooldown(lastAllFailedAt, settings.cooldownMs, now)) {
            NetMateLogs.log(context, "debug", "WiFi 重连处于冷却期，跳过")
            return false
        }

        val snapshot = WifiEnvironment.snapshot(context)
        val policy = AutoAuthPolicy.decide(profile.copy(enabled = true, authPaused = false), snapshot.ssid, snapshot.ipv4, snapshot.captive, snapshot.security, snapshot.bssid)
        val currentRule = profile.wifiRules.filter { WifiSecurity.match(it, snapshot.ssid, snapshot.security, snapshot.bssid) > 0 }.maxByOrNull { WifiSecurity.match(it, snapshot.ssid, snapshot.security, snapshot.bssid) }
        val rules = (if (trigger == "startup-current") listOfNotNull(currentRule) else profile.autoConnectWifis).toMutableList()
        if (trigger != "startup-current" && snapshot.connected && currentRule?.autoConnect == false) rules.add(0, currentRule)
        if (snapshot.ssid != null && currentRule == null && (trigger != "startup" || profile.keepCurrentConnection)) rules.add(0, AutoAuthWifiRule(snapshot.ssid, policy.requiresAuth, emptyList(), id = "current-network", security = snapshot.security, bssid = snapshot.bssid, autoConnect = true, priority = 0))
        val candidates = rules.map {
            WifiReconnectPolicy.Candidate(it.ssid, it.password, it.priority, it.id, it.security, it.bssid)
        }
        val currentId = currentRule?.id ?: if (snapshot.connected) candidates.firstOrNull { it.id == "current-network" }?.id else previousWifiId
        val plan = WifiReconnectPolicy.plan(disconnectedSsid, candidates, currentId)
        if (plan.isEmpty()) return false

        NetMateLogs.log(context, "info", "开始 WiFi 自动重连（$trigger），候选 ${plan.size} 个")
        val failed = JSONArray()
        for (candidate in plan) {
            var failureReason = "未在等待时间内连接目标网络"
            for (attempt in 1..settings.retriesPerWifi) {
                if (attempt > 1) sleeper(RETRY_GAP_MS)
                val current = AutoAuthStore.loadProfile(context)
                if (!shouldContinue() || !WifiConnector.state(context).enabled || current == null || (!current.enabled && !startup) || rules.none { it.id == candidate.id }) return false
                ReconnectEvents.publish(JSONObject().put("status", "connecting").put("wifiId", candidate.id).put("ssid", candidate.ssid).put("attempt", attempt).put("maxAttempts", settings.retriesPerWifi))

                val rule = rules.first { it.id == candidate.id }
                val accepted = try {
                    if (!WifiSecurity.connected(rule, WifiEnvironment.snapshot(context)) && android.os.Build.VERSION.SDK_INT >= 29 && WifiEnvironment.connectPort == null) WifiSuggestions.select(context, rule)
                    if (WifiSecurity.connected(rule, WifiEnvironment.snapshot(context))) true else if (!rule.autoConnect) false else WifiConnector.connect(context, candidate.ssid, candidate.password, candidate.security, candidate.bssid, ruleId = candidate.id)
                } catch (e: Exception) {
                    failureReason = com.netmate.app.logging.LogJournal.safe(e.message ?: "提交 WiFi 连接失败")
                    NetMateLogs.log(context, "warn", failureReason, "wifi")
                    false
                }
                if (!shouldContinue()) return false
                if (accepted && !WifiSecurity.connected(rule, WifiEnvironment.snapshot(context))) ReconnectEvents.publish(JSONObject().put("status", "awaiting-system").put("ssid", candidate.ssid).put("wifiId", candidate.id).put("attempt", attempt).put("maxAttempts", settings.retriesPerWifi).put("reason", "等待系统选择目标 WiFi，可打开系统 WiFi 设置确认"))
                if (accepted && waitForConnection(context, candidate, shouldContinue, startup)) {
                    val result = verify?.invoke(rule) { phase -> if (shouldContinue()) ReconnectEvents.publish(JSONObject().put("status", phase).put("ssid", candidate.ssid).put("wifiId", candidate.id).put("attempt", attempt).put("maxAttempts", settings.retriesPerWifi)) } ?: WifiVerification(true)
                    if (!shouldContinue()) return false
                    if (!result.online) {
                        if (!result.retryable || attempt == settings.retriesPerWifi) {
                            failed.put(JSONObject().put("ssid", candidate.ssid).put("wifiId", candidate.id).put("reason", result.reason))
                            break
                        }
                        continue
                    }
                    val connectedSsid = WifiConnector.state(context).ssid ?: candidate.ssid
                    lastAllFailedAt = 0L
                    EventNotifier.notify(
                        context,
                        EventNotifier.Kind.RECONNECT_SUCCESS,
                        "WiFi 已重新连接",
                        "已连接到 $connectedSsid",
                    )
                    ReconnectEvents.publish(JSONObject().put("status", "success").put("ssid", connectedSsid).put("wifiId", candidate.id).put("attempt", attempt).put("maxAttempts", settings.retriesPerWifi))
                    NetMateLogs.log(context, "success", "WiFi 已连接：$connectedSsid", "wifi")
                    return true
                }
            }
            if ((0 until failed.length()).none { failed.getJSONObject(it).optString("wifiId") == candidate.id }) failed.put(JSONObject().put("ssid", candidate.ssid).put("wifiId", candidate.id).put("reason", failureReason))
            if (!shouldContinue()) return false
            if (android.os.Build.VERSION.SDK_INT >= 29 && WifiEnvironment.connectPort == null) WifiSuggestions.reject(context, candidate.id)
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

    private fun waitForConnection(context: Context, target: WifiReconnectPolicy.Candidate, shouldContinue: () -> Boolean, startup: Boolean): Boolean {
        var waited = 0L
        while (waited < CONNECT_WAIT_MS) {
            val state = WifiEnvironment.snapshot(context)
            if (!shouldContinue() || !state.enabled || AutoAuthStore.loadProfile(context)?.let { (it.enabled || startup) } != true) return false
            if (WifiSecurity.connected(AutoAuthWifiRule(target.ssid, false, emptyList(), security = target.security, bssid = target.bssid), state)) return true
            sleeper(POLL_MS)
            waited += POLL_MS
        }
        val state = WifiEnvironment.snapshot(context)
        return WifiSecurity.connected(AutoAuthWifiRule(target.ssid, false, emptyList(), security = target.security, bssid = target.bssid), state)
    }
}
