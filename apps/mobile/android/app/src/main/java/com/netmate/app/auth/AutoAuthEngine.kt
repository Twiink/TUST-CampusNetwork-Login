package com.netmate.app.auth

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.util.Log
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors
import java.util.concurrent.Future

/**
 * 原生自动认证引擎：BackgroundService（网络事件 + 定时）、AutoAuthWorker（WorkManager 兜底）
 * 与 AutoAuthModule（JS 前台触发）共用。对齐参考实现 tust-portal-desktop background.rs：
 * 每次检查只看「现在是否需要登录」——需要认证 且 探测不到 204 才登录。
 *
 * 所有检查（含 WiFi 自动重连）串行执行（单线程），同一时刻最多一个流程；
 * 连续登录失败按指数退避，避免密码错误时持续请求门户。
 */
object AutoAuthEngine {

    private const val TAG = "AutoAuthEngine"
    private const val MIN_LOGIN_INTERVAL_MS = 30_000L
    private const val BASE_FAILURE_BACKOFF_MS = 60_000L
    private const val MAX_FAILURE_BACKOFF_MS = 15 * 60_000L

    /** 触发来源；manual 不受退避限制，也不受连续失败阈值限制 */
    const val TRIGGER_MANUAL = "manual"
    /** 网络事件触发（WiFi 刚连上、强制门户），视为确定需要检查，不受连续失败阈值限制 */
    const val TRIGGER_NETWORK = "network"

    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "netmate-auto-auth").apply { isDaemon = true }
    }
    private val listeners = CopyOnWriteArraySet<(AutoAuthResult) -> Unit>()

    /** 后台读不到 SSID 时，复用前台读到的同一网络连接的 SSID（networkHandle 在一次连接内稳定） */
    private val ssidByNetwork = ConcurrentHashMap<Long, String>()

    // 以下状态只在 executor 线程读写
    private var lastLoginAt = 0L
    private var consecutiveFailures = 0
    /** 当前 WiFi 曾确认在线；用于连续失败阈值与「认证恢复」通知 */
    private var wasOnline = false
    /** 已在线后连续检测不到 204 的次数 */
    private var offlineStreak = 0
    /** 本次连接是否已因掉线发生过认证（成功后发「认证恢复」通知） */
    private var lostAuthentication = false
    private val wifiReconnector = WifiReconnector()

    @Volatile
    var portalClient: PortalClient = PortalClient()

    fun addListener(listener: (AutoAuthResult) -> Unit) {
        listeners.add(listener)
    }

    fun removeListener(listener: (AutoAuthResult) -> Unit) {
        listeners.remove(listener)
    }

    /** 配置变化后清除退避与冷却，新账号/新密码/新 WiFi 可以立即尝试 */
    fun resetBackoff() {
        executor.execute {
            consecutiveFailures = 0
            lastLoginAt = 0L
            wifiReconnector.resetCooldown()
        }
    }

    fun rememberSsid(network: Network, ssid: String) {
        ssidByNetwork[network.networkHandle] = ssid
    }

    /** 异步检查；返回 Future，结果为 null 表示本轮无需（或暂不）登录 */
    fun checkAsync(context: Context, trigger: String): Future<AutoAuthResult?> {
        val appContext = context.applicationContext
        return executor.submit<AutoAuthResult?> { runCheck(appContext, trigger) }
    }

    /** 同步检查（WorkManager Worker 已在后台线程，直接排队等待结果） */
    fun checkBlocking(context: Context, trigger: String): AutoAuthResult? =
        checkAsync(context, trigger).get()

    /**
     * WiFi 断开：发送断开通知，并按「断线自动重连」执行 WiFi 三阶段重连。
     * @param ssid 断开前的 SSID（由服务在连接期间记录）
     */
    fun onWifiLost(context: Context, ssid: String?) {
        val appContext = context.applicationContext
        executor.execute {
            try {
                resetConnectionState()
                val profile = AutoAuthStore.loadProfile(appContext) ?: return@execute
                EventNotifier.notify(
                    appContext,
                    EventNotifier.Kind.WIFI_DISCONNECTED,
                    "WiFi 已断开",
                    if (ssid != null) "已断开 $ssid" else "WiFi 连接已断开",
                )
                if (profile.enabled) {
                    wifiReconnector.run(appContext, profile, ssid, "lost")
                }
            } catch (e: Exception) {
                Log.w(TAG, "WiFi 断开处理异常", e)
            }
        }
    }

    /**
     * 启动时自动连接（settings.startupAutoConnect）：未连接 WiFi 时按优先级尝试已配置 WiFi。
     * 已连接 WiFi 时，「保持当前连接」开启则不动；关闭则在当前 WiFi 不在已配置列表中时切换到最高优先级的 WiFi。
     */
    fun onStartup(context: Context) {
        val appContext = context.applicationContext
        executor.execute {
            try {
                val profile = AutoAuthStore.loadProfile(appContext) ?: return@execute
                if (!profile.startupAutoConnect) return@execute
                val state = WifiConnector.state(appContext)
                if (!state.enabled) return@execute
                if (state.connected) {
                    val configured = state.ssid != null && profile.autoConnectWifis.any { it.ssid == state.ssid }
                    if (profile.keepCurrentConnection || configured || state.ssid == null) return@execute
                    // 不保持当前连接：建议最高优先级的已配置 WiFi，由系统决定是否切换
                    profile.autoConnectWifis.minByOrNull { it.priority }?.let { best ->
                        WifiConnector.connect(appContext, best.ssid, best.password)
                    }
                    return@execute
                }
                wifiReconnector.run(appContext, profile, null, "startup")
            } catch (e: Exception) {
                Log.w(TAG, "启动自动连接异常", e)
            }
        }
    }

    private fun resetConnectionState() {
        wasOnline = false
        offlineStreak = 0
        lostAuthentication = false
    }

    private fun runCheck(context: Context, trigger: String): AutoAuthResult? {
        return try {
            doCheck(context, trigger)
        } catch (e: Exception) {
            Log.w(TAG, "自动认证检查异常", e)
            null
        }
    }

    private fun doCheck(context: Context, trigger: String): AutoAuthResult? {
        val profile = AutoAuthStore.loadProfile(context) ?: return null
        if (!profile.enabled) return null

        val connectivityManager =
            context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = LocalAddresses.wifiNetworks(connectivityManager).firstOrNull() ?: return null
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return null
        val captivePortal = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_CAPTIVE_PORTAL)

        val ssid = readSsid(context, network)
        val (ipv4, ipv6) = LocalAddresses.resolve(connectivityManager, network)
        val decision = AutoAuthPolicy.decide(profile, ssid, ipv4, captivePortal)
        if (!decision.requiresAuth || ipv4 == null) return null
        if (decision.accounts.isEmpty()) {
            Log.d(TAG, "需要认证但没有可用账号: ${decision.reason}")
            return null
        }

        val client = portalClient
        if (client.isOnline(network)) {
            consecutiveFailures = 0
            wasOnline = true
            offlineStreak = 0
            return null
        }

        // 连续失败阈值：已在线后偶发的探测失败（网络抖动）不立即重新认证。
        // 强制门户、网络事件、手动触发视为确定掉线，不受阈值限制。
        val definite = captivePortal || trigger == TRIGGER_MANUAL || trigger == TRIGGER_NETWORK
        if (wasOnline && !definite) {
            offlineStreak += 1
            if (offlineStreak < profile.failureThreshold) {
                Log.d(TAG, "检测失败 $offlineStreak/${profile.failureThreshold}，暂不重新认证")
                return null
            }
        }
        if (wasOnline) lostAuthentication = true

        val now = System.currentTimeMillis()
        if (trigger != TRIGGER_MANUAL && now - lastLoginAt < currentCooldownMs()) {
            Log.d(TAG, "处于冷却期，跳过本轮认证（连续失败 $consecutiveFailures 次）")
            return null
        }
        lastLoginAt = now

        var lastOutcome: PortalClient.LoginOutcome? = null
        var lastAccount: AutoAuthAccount? = null
        for (account in decision.accounts) {
            val outcome = client.login(
                PortalClient.Credentials(account.username, account.password, account.isp, account.serverUrl),
                ipv4,
                ipv6,
                network,
            )
            lastOutcome = outcome
            lastAccount = account
            if (outcome.success) break
        }

        val success = lastOutcome?.success == true
        if (success) {
            consecutiveFailures = 0
            offlineStreak = 0
            wasOnline = true
            if (lostAuthentication) {
                lostAuthentication = false
                EventNotifier.notify(
                    context,
                    EventNotifier.Kind.AUTH_RECOVERED,
                    "校园网认证已恢复",
                    "认证失效后已自动重新登录（${lastAccount?.username ?: ""}）",
                )
            }
            // 提示系统重新验证该 WiFi，使其恢复为可上网的默认网络（不再走移动数据）
            try {
                connectivityManager.reportNetworkConnectivity(network, true)
            } catch (_: Exception) {
                // 仅为优化项
            }
        } else {
            consecutiveFailures += 1
        }

        val result = AutoAuthResult(
            success = success,
            message = lastOutcome?.message ?: "登录失败",
            trigger = trigger,
            username = lastAccount?.username,
            attempts = lastOutcome?.attempts ?: 0,
            timestamp = System.currentTimeMillis(),
        )
        AutoAuthStore.saveLastResult(context, result)
        listeners.forEach { listener ->
            try {
                listener(result)
            } catch (e: Exception) {
                Log.w(TAG, "自动认证结果回调异常", e)
            }
        }
        return result
    }

    private fun currentCooldownMs(): Long {
        if (consecutiveFailures == 0) return MIN_LOGIN_INTERVAL_MS
        val exponent = (consecutiveFailures - 1).coerceAtMost(4)
        return (BASE_FAILURE_BACKOFF_MS shl exponent).coerceAtMost(MAX_FAILURE_BACKOFF_MS)
    }

    internal fun readSsid(context: Context, network: Network): String? {
        val ssid = try {
            val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            wifiManager.connectionInfo?.ssid
                ?.takeIf { it != WifiManager.UNKNOWN_SSID && it != "0x" && it.isNotBlank() }
                ?.removeSurrounding("\"")
        } catch (e: Exception) {
            null
        }
        if (ssid != null) {
            ssidByNetwork[network.networkHandle] = ssid
            return ssid
        }
        // Android 10+ 后台读取 SSID 需要后台定位权限，读不到时用同一连接内前台缓存的值
        return ssidByNetwork[network.networkHandle]
    }
}
