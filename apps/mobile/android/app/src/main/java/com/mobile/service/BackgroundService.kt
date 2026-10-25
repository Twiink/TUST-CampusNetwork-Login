package com.mobile.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.mobile.MainActivity
import com.mobile.R

/**
 * 后台服务
 *
 * 负责在后台执行心跳检测和自动重连任务
 */
class BackgroundService : Service() {

    companion object {
        const val CHANNEL_ID = "netmate_background_service"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "com.mobile.service.START"
        const val ACTION_STOP = "com.mobile.service.STOP"

        private var isRunning = false

        fun isServiceRunning(): Boolean = isRunning
    }

    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var lastNotifiedAt = 0L

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopNetworkWatch()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                isRunning = false
                return START_NOT_STICKY
            }
            ACTION_START -> {
                // interval 参数保留兼容旧调用；检测节奏由网络事件驱动
            }
        }

        val notification = createNotification("NetMate 正在后台运行", "心跳检测中...")
        startForeground(NOTIFICATION_ID, notification)
        isRunning = true

        startNetworkWatch()

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        stopNetworkWatch()
        isRunning = false
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
                description = "NetMate 后台心跳检测服务"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    /**
     * 创建前台通知
     */
    private fun createNotification(title: String, content: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    /**
     * 更新通知内容
     */
    private fun updateNotification(title: String, content: String) {
        val notification = createNotification(title, content)
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    /**
     * 监听系统网络事件，仅在实际变化时更新通知，替代固定间隔定时唤醒
     */
    private fun startNetworkWatch() {
        stopNetworkWatch()

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = notifyNetworkState(true)
            override fun onLost(network: Network) = notifyNetworkState(false)
        }
        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .build()
        connectivityManager.registerNetworkCallback(request, callback)
        networkCallback = callback

        val activeNetwork = connectivityManager.activeNetwork
        val connected = connectivityManager.getNetworkCapabilities(activeNetwork)
            ?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        notifyNetworkState(connected)
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

    private fun notifyNetworkState(connected: Boolean) {
        val now = System.currentTimeMillis()
        if (now - lastNotifiedAt < 1000) return
        lastNotifiedAt = now

        val timestamp = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())
            .format(java.util.Date())
        if (connected) {
            updateNotification("NetMate 后台运行中", "WiFi 已连接 · $timestamp")
        } else {
            updateNotification("NetMate 网络变化", "WiFi 未连接 · $timestamp")
        }
    }
}
