package com.netmate.app.auth

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.netmate.app.MainActivity

/**
 * 事件通知（WiFi 断开 / WiFi 重连成功 / WiFi 重连全部失败 / 认证恢复）。
 * 各场景是否发送由设置页「通知设置」决定（同步在 [AutoAuthProfile.notifications]）。
 * 与常驻的前台服务通知分开渠道，用户可以在系统设置里单独关闭。
 */
object EventNotifier {

    private const val CHANNEL_ID = "netmate_events"

    enum class Kind(val notificationId: Int) {
        WIFI_DISCONNECTED(2001),
        RECONNECT_SUCCESS(2002),
        RECONNECT_FAILED(2003),
        AUTH_RECOVERED(2004),
    }

    fun isEnabled(flags: NotificationFlags, kind: Kind): Boolean = when (kind) {
        Kind.WIFI_DISCONNECTED -> flags.wifiDisconnected
        Kind.RECONNECT_SUCCESS -> flags.reconnectSuccess
        Kind.RECONNECT_FAILED -> flags.reconnectFailed
        Kind.AUTH_RECOVERED -> flags.authRecovered
    }

    @SuppressLint("MissingPermission")
    fun notify(context: Context, kind: Kind, title: String, text: String) {
        val appContext = context.applicationContext
        val profile = AutoAuthStore.loadProfile(appContext) ?: return
        if (!isEnabled(profile.notifications, kind)) return

        val manager = NotificationManagerCompat.from(appContext)
        // Android 13+ 未授予 POST_NOTIFICATIONS 时 areNotificationsEnabled 为 false
        if (!manager.areNotificationsEnabled()) return

        ensureChannel(appContext)
        val pendingIntent = PendingIntent.getActivity(
            appContext,
            kind.notificationId,
            Intent(appContext, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try {
            manager.notify(kind.notificationId, notification)
        } catch (_: SecurityException) {
            // 权限在检查后被撤销
        }
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(CHANNEL_ID, "网络事件", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "WiFi 断开、自动重连与校园网认证结果"
        }
        manager.createNotificationChannel(channel)
    }
}
