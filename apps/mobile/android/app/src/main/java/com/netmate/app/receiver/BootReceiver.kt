package com.netmate.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.netmate.app.auth.AutoAuthStore
import com.netmate.app.auth.AutoAuthWorker
import com.netmate.app.service.BackgroundService

/**
 * 开机自启广播接收器
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {

            Log.d(TAG, "Boot completed, checking if should start service...")

            // 自动认证的 WorkManager 兜底不依赖开机自启开关，只要开启了自动认证就恢复
            if (AutoAuthStore.loadProfile(context)?.enabled == true) {
                AutoAuthWorker.schedule(context)
            }

            // 检查是否启用了开机自启（从 SharedPreferences 读取）
            val prefs = context.getSharedPreferences("netmate_settings", Context.MODE_PRIVATE)
            val autoStartEnabled = prefs.getBoolean("auto_start_on_boot", false)

            if (autoStartEnabled) {
                Log.d(TAG, "Auto-start enabled, starting background service...")

                val serviceIntent = Intent(context, BackgroundService::class.java).apply {
                    action = BackgroundService.ACTION_START
                }

                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent)
                    } else {
                        context.startService(serviceIntent)
                    }
                } catch (e: Exception) {
                    // 部分系统/厂商限制开机拉起前台服务；此时由 WorkManager 兜底，用户打开应用后服务会再次启动
                    Log.w(TAG, "Failed to start background service on boot", e)
                }
            } else {
                Log.d(TAG, "Auto-start disabled, skipping service start")
            }
        }
    }
}
