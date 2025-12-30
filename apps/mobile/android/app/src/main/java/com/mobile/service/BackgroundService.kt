package com.mobile.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.mobile.MainActivity
import com.mobile.R
import java.util.Timer
import java.util.TimerTask

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

    private var heartbeatTimer: Timer? = null
    private var heartbeatInterval: Long = 30000 // 默认 30 秒

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopHeartbeat()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                isRunning = false
                return START_NOT_STICKY
            }
            ACTION_START -> {
                intent.getLongExtra("interval", 30000).let {
                    heartbeatInterval = it
                }
            }
        }

        val notification = createNotification("NetMate 正在后台运行", "心跳检测中...")
        startForeground(NOTIFICATION_ID, notification)
        isRunning = true

        startHeartbeat()

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        stopHeartbeat()
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
     * 启动心跳检测
     */
    private fun startHeartbeat() {
        stopHeartbeat()

        heartbeatTimer = Timer().apply {
            scheduleAtFixedRate(object : TimerTask() {
                override fun run() {
                    performHeartbeat()
                }
            }, 0, heartbeatInterval)
        }
    }

    /**
     * 停止心跳检测
     */
    private fun stopHeartbeat() {
        heartbeatTimer?.cancel()
        heartbeatTimer = null
    }

    /**
     * 执行心跳检测
     */
    private fun performHeartbeat() {
        // 这里只是更新通知，实际的网络检测由 React Native 层处理
        // 通过 HeadlessJS 或 EventEmitter 与 JS 层通信
        val timestamp = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault())
            .format(java.util.Date())
        updateNotification("NetMate 后台运行中", "上次检测: $timestamp")
    }
}
