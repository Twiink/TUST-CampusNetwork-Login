package com.netmate.app.auth

import android.content.Context
import android.net.Network
import com.netmate.app.logging.NetMateLogs
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** One serial engine for foreground, background, manual login and logout. */
object AutoAuthEngine {
    const val TRIGGER_MANUAL = "manual"
    const val TRIGGER_NETWORK = "network"
    private val executor = Executors.newSingleThreadScheduledExecutor { runnable -> Thread(runnable, "netmate-auth").apply { isDaemon = true } }
    private val listeners = CopyOnWriteArraySet<(AutoAuthResult) -> Unit>()
    val statusListeners = CopyOnWriteArraySet<(JSONObject) -> Unit>()
    @Volatile private var authenticatedKey: String? = null
    @Volatile private var internetKey: String? = null
    private val reconnectGeneration = java.util.concurrent.atomic.AtomicLong()
    private var observedKey: String? = null
    @Volatile private var lastWifiId: String? = null
    @Volatile private var loggedOutKey: String? = null
    @Volatile private var authenticating = false
    @Volatile private var retryTask: ScheduledFuture<*>? = null
    private var lastLoginAt = 0L
    private var failures = 0
    @Volatile private var recovering = false
    @Volatile private var manualConnection = false
    private var startupRecovery = false
    fun beginManualConnection(context: Context) { manualConnection = true; stopReconnect(context) }
    fun endManualConnection(context: Context) { manualConnection = false; checkAsync(context, TRIGGER_NETWORK) }
    fun retryNow(context: Context) { resetBackoff(); executor.execute { reconnect(context, WifiEnvironment.snapshot(context).ssid, "retry-now") } }
    fun runConnection(operation: () -> Unit) { executor.execute(operation) }

    private var wasOnline = false
    private var offlineStreak = 0
    private val reconnector = WifiReconnector()
    @Volatile var portalClient = PortalClient()

    fun addListener(listener: (AutoAuthResult) -> Unit) { listeners.add(listener) }
    fun removeListener(listener: (AutoAuthResult) -> Unit) { listeners.remove(listener) }
    fun rememberSsid(network: Network, ssid: String) = WifiEnvironment.rememberSsid(network, ssid)
    internal fun readSsid(context: Context, network: Network): String? = WifiEnvironment.snapshot(context).ssid

    fun stopReconnect(context: Context, reason: String = "自动恢复已停止") {
        reconnectGeneration.incrementAndGet()
        retryTask?.cancel(false); retryTask = null
        AutoAuthStore.savePendingSsid(context, null)
        ReconnectEvents.publish(JSONObject().put("status", "cancelled").put("reason", reason))
    }

    fun resetBackoff() {
        reconnectGeneration.incrementAndGet()
        retryTask?.cancel(false)
        retryTask = null
        executor.execute { failures = 0; lastLoginAt = 0; reconnector.resetCooldown() }
    }

    fun snapshot(context: Context, wifi: WifiEnvironment.Snapshot = WifiEnvironment.snapshot(context)): JSONObject {
        val profile = AutoAuthStore.loadProfile(context)
        val requires = profile?.let { AutoAuthPolicy.decide(it.copy(enabled = true, authPaused = false), wifi.ssid, wifi.ipv4, wifi.captive, wifi.security, wifi.bssid).requiresAuth } ?: false
        val reachable = wifi.connected && (internetKey == wifi.key || (wifi.validated && !wifi.captive && loggedOutKey != wifi.key))
        val authenticated = wifi.connected && (authenticatedKey == wifi.key || reachable)
        return JSONObject().put("networkKey", wifi.key).put("ssid", wifi.ssid ?: JSONObject.NULL)
            .put("wifiConnected", wifi.connected).put("authenticated", requires && authenticated)
            .put("internetReachable", reachable).put("requiresAuth", requires)
            .put("authenticating", authenticating).put("paused", profile?.authPaused ?: false)
            .put("revision", profile?.revision ?: 0).put("timestamp", System.currentTimeMillis())
    }
    private fun publishStatus(context: Context) {
        val state = snapshot(context)
        statusListeners.forEach { try { it(state) } catch (_: Exception) {} }
    }
    private fun emit(context: Context, result: AutoAuthResult): AutoAuthResult {
        val safe = result.copy(message = com.netmate.app.logging.LogJournal.safe(result.message))
        AutoAuthStore.saveLastResult(context, safe)
        NetMateLogs.log(context, if (safe.success) "success" else "warn", safe.message, "auth")
        listeners.forEach { try { it(safe) } catch (_: Exception) {} }
        publishStatus(context)
        return safe
    }
    private val pendingChecks = mutableMapOf<String, Future<AutoAuthResult?>>()
    @Synchronized fun checkAsync(context: Context, trigger: String): Future<AutoAuthResult?> {
        val key = if (trigger == TRIGGER_MANUAL) TRIGGER_MANUAL else "automatic"
        pendingChecks[key]?.takeIf { !it.isDone }?.let { return it }
        return executor.submit<AutoAuthResult?> {
            try { check(context.applicationContext, trigger) }
            catch (_: Exception) { NetMateLogs.log(context, "warn", "认证检查失败，请检查网络与权限", "auth"); null }
        }.also { pendingChecks[key] = it }
    }
    fun checkForJob(context: Context): Future<AutoAuthResult?> = executor.submit<AutoAuthResult?> { check(context.applicationContext, AutoAuthWorker.TRIGGER) }
    fun checkBlocking(context: Context, trigger: String): AutoAuthResult? = checkAsync(context, trigger).get()

    fun logoutAsync(context: Context): Future<AutoAuthResult> {
        AutoAuthStore.pause(context)
        stopReconnect(context)
        publishStatus(context)
        return executor.submit<AutoAuthResult> {
            val wifi = WifiEnvironment.snapshot(context)
            val stored = AutoAuthStore.loadProfile(context)
            val decision = stored?.let { AutoAuthPolicy.decide(it.copy(enabled = true, authPaused = false), wifi.ssid, wifi.ipv4, wifi.captive, wifi.security, wifi.bssid) }
            val portals = decision?.accounts.orEmpty().map { it.serverUrl }.distinct()
            val server = AutoAuthStore.sessionServer(context, wifi) ?: portals.singleOrNull()
            val outcome = if (!wifi.connected || server.isNullOrBlank()) PortalClient.LoginOutcome(false, "无法确定当前认证服务器，请连接原 WiFi 或重新登录后注销", 0)
                else portalClient.logout(server, wifi.network)
            if (outcome.success) { AutoAuthStore.clearSession(context); authenticatedKey = null; internetKey = null; loggedOutKey = wifi.key; wasOnline = false }
            emit(context, AutoAuthResult(outcome.success, outcome.message, "logout", null, outcome.attempts, System.currentTimeMillis(), wifi.key))
        }
    }

    private fun check(context: Context, trigger: String): AutoAuthResult? {
        val stored = AutoAuthStore.loadProfile(context) ?: return null
        WifiSuggestions.expire(context, onlyDisconnected = true)
        val manual = trigger == TRIGGER_MANUAL
        val generation = reconnectGeneration.get()
        val wifi = WifiEnvironment.snapshot(context)
        if (wifi.connected) lastWifiId = stored.wifiRules.filter { WifiSecurity.match(it, wifi.ssid, wifi.security, wifi.bssid) > 0 }.maxByOrNull { WifiSecurity.match(it, wifi.ssid, wifi.security, wifi.bssid) }?.id
        if (observedKey != wifi.key) { observedKey = wifi.key; wasOnline = false; offlineStreak = 0; failures = 0; lastLoginAt = 0 }
        if (!wifi.connected) {
            authenticatedKey = null
            internetKey = null
            publishStatus(context)
            val pending = AutoAuthStore.pendingSsid(context)
            if (stored.enabled && pending != null && retryTask == null) reconnect(context, pending, trigger)
            return if (manual) emit(context, AutoAuthResult(false, "请先连接 WiFi", trigger, null, 0, System.currentTimeMillis(), wifi.key)) else null
        }
        val client = portalClient
        val online = (wifi.validated && !wifi.captive && loggedOutKey != wifi.key) || client.isOnline(wifi.network)
        if (generation != reconnectGeneration.get() || manualConnection || Thread.currentThread().isInterrupted || WifiEnvironment.snapshot(context).key != wifi.key) return null
        internetKey = if (online) wifi.key else null
        if (online) {
            retryTask?.cancel(false); retryTask = null; AutoAuthStore.savePendingSsid(context, null)
            authenticatedKey = wifi.key; loggedOutKey = null; failures = 0; offlineStreak = 0; wasOnline = true
            publishStatus(context)
            return if (manual) emit(context, AutoAuthResult(true, "当前 WiFi 已联网", trigger, null, 0, System.currentTimeMillis(), wifi.key)) else null
        }
        if (trigger != TRIGGER_MANUAL && trigger != "candidate" && trigger != "status") {
            publishStatus(context)
            if (!stored.enabled || manualConnection || recovering || (stored.authPaused && AutoAuthPolicy.decide(stored.copy(enabled = true, authPaused = false), wifi.ssid, wifi.ipv4, wifi.captive, wifi.security, wifi.bssid).requiresAuth)) return null
            if (wasOnline && trigger != TRIGGER_NETWORK && ++offlineStreak < stored.failureThreshold) return null
            reconnect(context, wifi.ssid, trigger)
            return AutoAuthStore.loadLastResult(context)
        }
        if (trigger == "candidate" && authenticatedKey == wifi.key) return null
        // A failed Internet probe alone cannot invalidate a successful portal response.
        if (wifi.captive || loggedOutKey == wifi.key) authenticatedKey = null
        publishStatus(context)
        if (((!stored.enabled && !startupRecovery) || stored.authPaused) && !manual) return null
        if (trigger == "status") return null
        val decision = AutoAuthPolicy.decide(stored.copy(enabled = true, authPaused = false), wifi.ssid, wifi.ipv4, wifi.captive, wifi.security, wifi.bssid)
        if (!decision.requiresAuth || wifi.ipv4 == null || decision.accounts.isEmpty()) {
            return if (manual) emit(context, AutoAuthResult(false, if (decision.accounts.isEmpty()) "请先配置认证账号" else "当前网络无需认证", trigger, null, 0, System.currentTimeMillis(), wifi.key)) else null
        }
        if (!manual && trigger != "candidate" && wasOnline && !wifi.captive && trigger != TRIGGER_NETWORK && ++offlineStreak < stored.failureThreshold) return null
        val cooldown = if (failures == 0) 30_000L else (60_000L shl (failures - 1).coerceAtMost(4)).coerceAtMost(900_000L)
        if (!manual && trigger != "candidate" && System.currentTimeMillis() - lastLoginAt < cooldown) return null
        lastLoginAt = System.currentTimeMillis()
        fun valid(): Boolean {
            val current = AutoAuthStore.loadProfile(context) ?: return false
            return !Thread.currentThread().isInterrupted && reconnectGeneration.get() == generation && !manualConnection && current.revision == stored.revision && (manual || ((current.enabled || startupRecovery) && !current.authPaused)) && WifiEnvironment.snapshot(context).key == wifi.key
        }
        var outcome = PortalClient.LoginOutcome(false, "所有账号认证失败", 0)
        var account: AutoAuthAccount? = null
        authenticating = true; publishStatus(context)
        try {
            for (candidate in decision.accounts) {
                if (!valid()) return null
                account = candidate
                outcome = try { client.login(PortalClient.Credentials(candidate.username, candidate.password, candidate.isp, candidate.serverUrl), wifi.ipv4, wifi.ipv6, wifi.network, ::valid, maxAttempts = if (trigger == "candidate") 1 else stored.wifiRetries) }
                    catch (_: Exception) { PortalClient.LoginOutcome(false, "认证请求失败", 1) }
                if (outcome.success) break
            }
            if (!valid()) return null
            if (outcome.success) {
                internetKey = if (client.isOnline(wifi.network)) wifi.key else null
                if (!valid()) return null
                authenticatedKey = wifi.key; loggedOutKey = null; failures = 0
                AutoAuthStore.saveSession(context, account!!.serverUrl, account.id, wifi)
                if (wasOnline && internetKey == wifi.key) EventNotifier.notify(context, EventNotifier.Kind.AUTH_RECOVERED, "校园网认证已恢复", "已重新登录认证门户")
                wasOnline = internetKey == wifi.key
            } else { failures += 1; authenticatedKey = null }
            return emit(context, AutoAuthResult(outcome.success, outcome.message, trigger, account?.username, outcome.attempts, System.currentTimeMillis(), wifi.key))
        } finally { authenticating = false; publishStatus(context) }
    }

    fun onWifiLost(context: Context, ssid: String?) {
        if (recovering || manualConnection) return
        authenticatedKey = null; wasOnline = false
        if (ssid != null) AutoAuthStore.savePendingSsid(context, ssid, lastWifiId)
        publishStatus(context)
        executor.execute {
            EventNotifier.notify(context, EventNotifier.Kind.WIFI_DISCONNECTED, "WiFi 已断开", ssid ?: "无线连接已断开")
            reconnect(context.applicationContext, ssid, "lost")
        }
    }
    private fun reconnect(context: Context, ssid: String?, trigger: String) {
        // Foreground and service callbacks may report the same loss. Keep the scheduled round.
        if (retryTask?.isDone == false) return
        val profile = AutoAuthStore.loadProfile(context) ?: return
        if (manualConnection || recovering) return
        val initialWifi = WifiEnvironment.snapshot(context)
        if (initialWifi.connected) lastWifiId = profile.wifiRules.filter { WifiSecurity.match(it, initialWifi.ssid, initialWifi.security, initialWifi.bssid) > 0 }.maxByOrNull { WifiSecurity.match(it, initialWifi.ssid, initialWifi.security, initialWifi.bssid) }?.id
        else if (AutoAuthStore.pendingSsid(context) == ssid) lastWifiId = AutoAuthStore.pendingWifiId(context) ?: lastWifiId
        val startup = trigger == "startup" || trigger == "startup-current" || trigger == "retry-now"
        if ((!profile.enabled && !startup) || !initialWifi.enabled) {
            retryTask?.cancel(false); retryTask = null; AutoAuthStore.savePendingSsid(context, null)
            ReconnectEvents.publish(JSONObject().put("status", "cancelled").put("reason", if (!initialWifi.enabled) "系统 WiFi 已关闭" else "断线自动重连已关闭"))
            return
        }
        val generation = reconnectGeneration.get()
        if (wasOnline) authenticatedKey = null
        recovering = true; startupRecovery = startup
        val valid = { !Thread.currentThread().isInterrupted && reconnectGeneration.get() == generation && !manualConnection && WifiEnvironment.snapshot(context).enabled && AutoAuthStore.loadProfile(context)?.let { it.revision == profile.revision && (it.enabled || startup) } == true }
        val success = try { reconnector.run(context, profile, ssid, trigger, verify = { rule, phase ->
            val before = WifiEnvironment.snapshot(context)
            val requires = AutoAuthPolicy.decide(profile.copy(enabled = true, authPaused = false), before.ssid, before.ipv4, before.captive, before.security, before.bssid).requiresAuth
            var authFailure: String? = null
            if (requires && !profile.authPaused && authenticatedKey != before.key) { phase("authenticating"); val result = check(context, "candidate"); if (result?.success == false) authFailure = result.message }
            if (requires && profile.authPaused) {
                stopReconnect(context)
                return@run WifiVerification(false, reason = "自动认证已暂停")
            }
            val authenticated = authenticatedKey == WifiEnvironment.snapshot(context).key
            phase("verifying")
            var online = false
            val checks = if (requires && !authenticated) 1 else profile.failureThreshold
            for (index in 0 until checks) {
                if (!valid()) break
                if (index > 0) {
                    for (second in 0 until profile.heartbeatIntervalSeconds) { if (!valid()) break; Thread.sleep(1000L) }
                }
                if (!valid()) break
                val state = WifiEnvironment.snapshot(context)
                online = WifiSecurity.connected(rule, state) && ((state.validated && !state.captive) || portalClient.isOnline(state.network))
                internetKey = if (online) state.key else null
                publishStatus(context)
                if (online) break
            }
            WifiVerification(online, requires && authenticated, if (requires && authenticated) "已认证但互联网不可达" else authFailure ?: "互联网不可达", requires && !authenticated)
        }, startup = startup, previousWifiId = lastWifiId, shouldContinue = valid) } catch (error: Exception) {
            val reason = com.netmate.app.logging.LogJournal.safe(error.message ?: "网络恢复失败，请检查系统 WiFi 授权")
            NetMateLogs.log(context, "warn", reason, "wifi")
            if (valid()) ReconnectEvents.publish(JSONObject().put("status", "failed").put("reason", reason))
            false
        } finally { recovering = false; startupRecovery = false }

        if (reconnectGeneration.get() != generation) return
        if (!valid()) { ReconnectEvents.publish(JSONObject().put("status", "cancelled").put("reason", if (!WifiEnvironment.snapshot(context).enabled) "系统 WiFi 已关闭" else "恢复任务已取消")); return }
        if (success) {
            AutoAuthStore.savePendingSsid(context, null); retryTask?.cancel(false); retryTask = null
            publishStatus(context)
        } else {
            val current = AutoAuthStore.loadProfile(context) ?: return
            if (!WifiEnvironment.snapshot(context).enabled) { ReconnectEvents.publish(JSONObject().put("status", "cancelled")); return }; if (!current.enabled || current.autoConnectWifis.isEmpty()) return
            val target = ssid ?: current.autoConnectWifis.minByOrNull { it.priority }!!.ssid
            val failed = ReconnectEvents.latest.optJSONArray("failedList")
            AutoAuthStore.savePendingSsid(context, target, lastWifiId)
            val delay = (current.wifiCooldownMinutes * 60_000L).coerceAtLeast(5000)
            ReconnectEvents.publish(JSONObject().put("status", "cooldown").put("ssid", target).put("nextRetryAt", System.currentTimeMillis() + delay).put("failedList", failed))
            retryTask?.cancel(false)
            retryTask = executor.schedule({ retryTask = null; reconnect(context, target, "retry") }, delay, TimeUnit.MILLISECONDS)
        }
    }
    fun onStartup(context: Context) {
        executor.execute {
            val profile = AutoAuthStore.loadProfile(context) ?: return@execute
            val wifi = WifiEnvironment.snapshot(context)
            val pending = AutoAuthStore.pendingSsid(context)
            if (pending != null && profile.enabled) reconnect(context, pending, "retry")
            else if (profile.startupAutoConnect && (!wifi.connected || !profile.keepCurrentConnection)) {
                reconnect(context, null, "startup")
            } else if (profile.startupAutoConnect && wifi.connected) reconnect(context, wifi.ssid, "startup-current")
            else if (profile.enabled) check(context, TRIGGER_NETWORK)
        }
    }
}
