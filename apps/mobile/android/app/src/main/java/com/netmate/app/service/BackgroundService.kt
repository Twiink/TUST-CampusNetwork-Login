package com.netmate.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.netmate.app.MainActivity
import com.netmate.app.auth.AutoAuthEngine
import com.netmate.app.auth.AutoAuthResult
import com.netmate.app.auth.AutoAuthStore
import com.netmate.app.auth.LocalAddresses
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 后台服务
 *
 * 前台服务常驻，负责原生自动认证（对齐参考实现 tust-portal-desktop 的后台循环）：
 * - WiFi 网络事件（连上、能力变化如强制门户/验证状态）发生后短暂延迟立即检查
 * - 按心跳间隔定时检查，覆盖认证过期、被门户踢下线等无网络事件的情况
 * 检查与登录逻辑在 AutoAuthEngine 中，与 WorkManager 兜底任务和 JS 前台触发共用。
 */
class BackgroundService : Service() {

    companion object {
        const val CHANNEL_ID = "netmate_background_service"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "com.netmate.app.service.START"
        const val ACTION_STOP = "com.netmate.app.service.STOP"
        const val EXTRA_INTERVAL = "interval"

        private const val DEFAULT_INTERVAL_MS = 30_000L
        private const val MIN_INTERVAL_MS = 15_000L
        /** 网络刚连上时 DHCP/门户重定向尚未就绪，稍等再检查 */
        private const val NETWORK_EVENT_DELAY_MS = 3_000L

        @Volatile
        private var isRunning = false

        /** 进程内只在首次启动服务时执行一次「启动时自动连接」 */
        @Volatile
        private var startupHandled = false

        fun isServiceRunning(): Boolean = isRunning
    }

    private val handler = Handler(Looper.getMainLooper())
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var intervalMs = DEFAULT_INTERVAL_MS
    private var wifiConnected = false
    private var statusText = "等待网络"
    /** 当前 WiFi 的 SSID（连接期间记录，断开时用于重连与通知） */
    private var currentSsid: String? = null

    private val periodicCheck = object : Runnable {
        override fun run() {
            // 「启用心跳检测」关闭时不定时检测，只由网络事件与 WorkManager 兜底触发
            if (AutoAuthStore.loadProfile(this@BackgroundService)?.heartbeatEnabled != false) {
                requestCheck("interval")
            }
            handler.postDelayed(this, intervalMs)
        }
    }

    private val networkEventCheck = Runnable { requestCheck(AutoAuthEngine.TRIGGER_NETWORK) }

    private val resultListener: (AutoAuthResult) -> Unit = { result ->
        val time = formatTime(result.timestamp)
        statusText = if (result.success) {
            "已自动认证 · $time"
        } else {
            "自动认证失败 · $time · ${result.message}"
        }
        handler.post { refreshNotification() }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        AutoAuthEngine.addListener(resultListener)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopEverything()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        intent?.getLongExtra(EXTRA_INTERVAL, 0L)?.takeIf { it > 0 }?.let {
            intervalMs = it.coerceAtLeast(MIN_INTERVAL_MS)
        }

        startInForeground(createNotification())
        isRunning = true

        startNetworkWatch()
        handler.removeCallbacks(periodicCheck)
        handler.postDelayed(periodicCheck, intervalMs)

        if (!startupHandled) {
            startupHandled = true
            AutoAuthEngine.onStartup(this)
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        AutoAuthEngine.stopReconnect(this)
        stopEverything()
        AutoAuthEngine.removeListener(resultListener)
        super.onDestroy()
    }

    private fun stopEverything() {
        handler.removeCallbacks(periodicCheck)
        handler.removeCallbacks(networkEventCheck)
        stopNetworkWatch()
        isRunning = false
    }

    private fun startInForeground(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun requestCheck(trigger: String) {
        AutoAuthEngine.checkAsync(this, trigger)
    }

    /**
     * 创建通知渠道 (Android 8.0+)
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "后台服务",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "NetMate 校园网自动认证服务"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    /**
     * 创建前台通知
     */
    private fun createNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        val title = if (wifiConnected) "NetMate 自动认证运行中" else "NetMate 等待 WiFi"
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun refreshNotification() {
        if (!isRunning) return
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, createNotification())
    }

    /**
     * 监听 WiFi 网络事件：连上或能力变化（强制门户、验证状态）时尽快检查一次
     */
    private fun startNetworkWatch() {
        stopNetworkWatch()

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                val ssid = AutoAuthEngine.readSsid(this@BackgroundService, network)
                handler.post {
                    if (ssid != null) currentSsid = ssid
                    wifiConnected = true
                    statusText = "WiFi 已连接 · ${formatTime(System.currentTimeMillis())}"
                    refreshNotification()
                    scheduleNetworkEventCheck()
                }
            }

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                val needsCheck =
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_CAPTIVE_PORTAL) ||
                        !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                if (needsCheck) {
                    handler.post { scheduleNetworkEventCheck() }
                }
            }

            override fun onLost(network: Network) {
                handler.post {
                    // 切换 WiFi 时旧网络的 onLost 可能晚于新网络的 onAvailable，仍有 WiFi 时不算断开
                    if (LocalAddresses.wifiNetworks(connectivityManager).any { it != network }) {
                        return@post
                    }
                    val lostSsid = currentSsid
                    currentSsid = null
                    wifiConnected = false
                    statusText = "WiFi 未连接 · ${formatTime(System.currentTimeMillis())}"
                    handler.removeCallbacks(networkEventCheck)
                    refreshNotification()
                    AutoAuthEngine.onWifiLost(this@BackgroundService, lostSsid)
                }
            }
        }
        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .build()
        connectivityManager.registerNetworkCallback(request, callback)
        networkCallback = callback

        val snapshot = com.netmate.app.auth.WifiEnvironment.snapshot(this)
        wifiConnected = snapshot.connected
        currentSsid = snapshot.ssid
        refreshNotification()
    }

    /** 合并短时间内的多次网络事件，只检查一次 */
    private fun scheduleNetworkEventCheck() {
        handler.removeCallbacks(networkEventCheck)
        handler.postDelayed(networkEventCheck, NETWORK_EVENT_DELAY_MS)
    }

    private fun stopNetworkWatch() {
        networkCallback?.let {
            try {
                connectivityManager.unregisterNetworkCallback(it)
            } catch (_: Exception) {
                // callback 未注册时忽略
            }
        }
        networkCallback = null
    }

    private val connectivityManager: ConnectivityManager
        get() = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private fun formatTime(timestamp: Long): String =
        SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(timestamp))
}
