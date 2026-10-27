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
    @Volatile private var loggedOutKey: String? = null
    @Volatile private var authenticating = false
    @Volatile private var retryTask: ScheduledFuture<*>? = null
    private var lastLoginAt = 0L
    private var failures = 0
    private var wasOnline = false
    private var offlineStreak = 0
    private val reconnector = WifiReconnector()
    @Volatile var portalClient = PortalClient()

    fun addListener(listener: (AutoAuthResult) -> Unit) { listeners.add(listener) }
    fun removeListener(listener: (AutoAuthResult) -> Unit) { listeners.remove(listener) }
    fun rememberSsid(network: Network, ssid: String) = WifiEnvironment.rememberSsid(network, ssid)
    internal fun readSsid(context: Context, network: Network): String? = WifiEnvironment.snapshot(context).ssid

    fun stopReconnect(context: Context) {
        reconnectGeneration.incrementAndGet()
        retryTask?.cancel(false); retryTask = null
        AutoAuthStore.savePendingSsid(context, null)
        ReconnectEvents.publish(JSONObject().put("status", "idle"))
    }

    fun resetBackoff() {
        reconnectGeneration.incrementAndGet()
        retryTask?.cancel(false)
        retryTask = null
        executor.execute { failures = 0; lastLoginAt = 0; reconnector.resetCooldown() }
    }

    fun snapshot(context: Context): JSONObject {
        val wifi = WifiEnvironment.snapshot(context)
        val profile = AutoAuthStore.loadProfile(context)
        val requires = profile?.let { AutoAuthPolicy.decide(it.copy(enabled = true, authPaused = false), wifi.ssid, wifi.ipv4, wifi.captive).requiresAuth } ?: false
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
        AutoAuthStore.saveLastResult(context, result)
        NetMateLogs.log(context, if (result.success) "success" else "warn", result.message, "auth")
        listeners.forEach { try { it(result) } catch (_: Exception) {} }
        publishStatus(context)
        return result
    }
    fun checkAsync(context: Context, trigger: String): Future<AutoAuthResult?> = executor.submit<AutoAuthResult?> {
        try { check(context.applicationContext, trigger) }
        catch (_: Exception) { NetMateLogs.log(context, "warn", "认证检查失败，请检查网络与权限", "auth"); null }
    }
    fun checkBlocking(context: Context, trigger: String): AutoAuthResult? = checkAsync(context, trigger).get()

    fun logoutAsync(context: Context): Future<AutoAuthResult> {
        AutoAuthStore.pause(context)
        publishStatus(context)
        return executor.submit<AutoAuthResult> {
            val wifi = WifiEnvironment.snapshot(context)
            val server = AutoAuthStore.sessionServer(context)
                ?: AutoAuthStore.loadProfile(context)?.accounts?.firstOrNull()?.serverUrl
            val outcome = if (!wifi.connected || server.isNullOrBlank()) PortalClient.LoginOutcome(false, "无法注销：请连接认证时使用的 WiFi", 0)
                else portalClient.logout(server, wifi.network)
            if (outcome.success) { authenticatedKey = null; internetKey = null; loggedOutKey = wifi.key; wasOnline = false }
            emit(context, AutoAuthResult(outcome.success, outcome.message, "logout", null, outcome.attempts, System.currentTimeMillis(), wifi.key))
        }
    }

    private fun check(context: Context, trigger: String): AutoAuthResult? {
        val stored = AutoAuthStore.loadProfile(context) ?: return null
        val manual = trigger == TRIGGER_MANUAL
        val wifi = WifiEnvironment.snapshot(context)
        if (observedKey != wifi.key) { observedKey = wifi.key; wasOnline = false; offlineStreak = 0; failures = 0; lastLoginAt = 0 }
        if (!wifi.connected) {
            authenticatedKey = null
            publishStatus(context)
            val pending = AutoAuthStore.pendingSsid(context)
            if (stored.enabled && pending != null && retryTask == null) reconnect(context, pending, trigger)
            return if (manual) emit(context, AutoAuthResult(false, "请先连接 WiFi", trigger, null, 0, System.currentTimeMillis(), wifi.key)) else null
        }
        retryTask?.cancel(false); retryTask = null
        AutoAuthStore.savePendingSsid(context, null)
        val client = portalClient
        val online = (wifi.validated && !wifi.captive && loggedOutKey != wifi.key) || client.isOnline(wifi.network)
        internetKey = if (online) wifi.key else null
        if (online) {
            authenticatedKey = wifi.key; loggedOutKey = null; failures = 0; offlineStreak = 0; wasOnline = true
            publishStatus(context)
            return if (manual) emit(context, AutoAuthResult(true, "当前 WiFi 已联网", trigger, null, 0, System.currentTimeMillis(), wifi.key)) else null
        }
        authenticatedKey = null
        publishStatus(context)
        if ((!stored.enabled || stored.authPaused) && !manual) return null
        if (trigger == "status") return null
        val decision = AutoAuthPolicy.decide(stored.copy(enabled = true, authPaused = false), wifi.ssid, wifi.ipv4, wifi.captive)
        if (!decision.requiresAuth || wifi.ipv4 == null || decision.accounts.isEmpty()) {
            return if (manual) emit(context, AutoAuthResult(false, if (decision.accounts.isEmpty()) "请先配置认证账号" else "当前网络无需认证", trigger, null, 0, System.currentTimeMillis(), wifi.key)) else null
        }
        if (!manual && wasOnline && !wifi.captive && trigger != TRIGGER_NETWORK && ++offlineStreak < stored.failureThreshold) return null
        val cooldown = if (failures == 0) 30_000L else (60_000L shl (failures - 1).coerceAtMost(4)).coerceAtMost(900_000L)
        if (!manual && System.currentTimeMillis() - lastLoginAt < cooldown) return null
        lastLoginAt = System.currentTimeMillis()
        fun valid(): Boolean {
            val current = AutoAuthStore.loadProfile(context) ?: return false
            return current.revision == stored.revision && (manual || (current.enabled && !current.authPaused)) && WifiEnvironment.snapshot(context).key == wifi.key
        }
        var outcome = PortalClient.LoginOutcome(false, "所有账号认证失败", 0)
        var account: AutoAuthAccount? = null
        authenticating = true; publishStatus(context)
        try {
            for (candidate in decision.accounts) {
                if (!valid()) return null
                account = candidate
                outcome = try { client.login(PortalClient.Credentials(candidate.username, candidate.password, candidate.isp, candidate.serverUrl), wifi.ipv4, wifi.ipv6, wifi.network, ::valid) }
                    catch (_: Exception) { PortalClient.LoginOutcome(false, "认证请求失败", 1) }
                if (outcome.success) break
            }
            if (!valid()) return null
            if (outcome.success) {
                internetKey = if (client.isOnline(wifi.network)) wifi.key else null
                if (!valid()) return null
                authenticatedKey = wifi.key; loggedOutKey = null; failures = 0
                AutoAuthStore.saveSession(context, account!!.serverUrl)
                if (wasOnline) EventNotifier.notify(context, EventNotifier.Kind.AUTH_RECOVERED, "校园网认证已恢复", "已重新登录认证门户")
                wasOnline = true
            } else { failures += 1 }
            return emit(context, AutoAuthResult(outcome.success, outcome.message, trigger, account?.username, outcome.attempts, System.currentTimeMillis(), wifi.key))
        } finally { authenticating = false; publishStatus(context) }
    }

    fun onWifiLost(context: Context, ssid: String?) {
        authenticatedKey = null; wasOnline = false
        if (ssid != null) AutoAuthStore.savePendingSsid(context, ssid)
        publishStatus(context)
        executor.execute {
            EventNotifier.notify(context, EventNotifier.Kind.WIFI_DISCONNECTED, "WiFi 已断开", ssid ?: "无线连接已断开")
            reconnect(context.applicationContext, ssid, "lost")
        }
    }
    private fun reconnect(context: Context, ssid: String?, trigger: String) {
        val profile = AutoAuthStore.loadProfile(context) ?: return
        if (!profile.enabled || !WifiEnvironment.snapshot(context).enabled || profile.autoConnectWifis.isEmpty() || (ssid != null && profile.autoConnectWifis.none { it.ssid == ssid })) {
            retryTask?.cancel(false); retryTask = null; AutoAuthStore.savePendingSsid(context, null)
            ReconnectEvents.publish(JSONObject().put("status", "idle"))
            return
        }
        val generation = reconnectGeneration.get()
        val success = reconnector.run(context, profile, ssid, trigger) { reconnectGeneration.get() == generation }
        if (reconnectGeneration.get() != generation) return
        if (success) {
            AutoAuthStore.savePendingSsid(context, null); retryTask?.cancel(false); retryTask = null
            check(context, TRIGGER_NETWORK)
        } else {
            val current = AutoAuthStore.loadProfile(context) ?: return
            if (!current.enabled || !WifiEnvironment.snapshot(context).enabled || current.autoConnectWifis.isEmpty()) return
            val target = ssid ?: current.autoConnectWifis.minByOrNull { it.priority }!!.ssid
            AutoAuthStore.savePendingSsid(context, target)
            val delay = (current.wifiCooldownMinutes * 60_000L).coerceAtLeast(5000)
            ReconnectEvents.publish(JSONObject().put("status", "cooldown").put("ssid", target).put("nextRetryAt", System.currentTimeMillis() + delay))
            retryTask?.cancel(false)
            retryTask = executor.schedule({ retryTask = null; reconnect(context, target, "retry") }, delay, TimeUnit.MILLISECONDS)
        }
    }
    fun onStartup(context: Context) {
        executor.execute {
            val profile = AutoAuthStore.loadProfile(context) ?: return@execute
            val wifi = WifiEnvironment.snapshot(context)
            val pending = AutoAuthStore.pendingSsid(context)
            if (pending != null || (profile.startupAutoConnect && !wifi.connected)) reconnect(context, pending, "startup")
            else if (profile.enabled && profile.startupAutoConnect && !profile.keepCurrentConnection && wifi.connected && profile.wifiRules.none { it.ssid == wifi.ssid }) {
                val preferred = profile.autoConnectWifis.minByOrNull { it.priority }
                if (preferred != null && preferred.ssid != wifi.ssid && WifiConnector.connect(context, preferred.ssid, preferred.password)) check(context, TRIGGER_NETWORK)
            }
        }
    }
}
