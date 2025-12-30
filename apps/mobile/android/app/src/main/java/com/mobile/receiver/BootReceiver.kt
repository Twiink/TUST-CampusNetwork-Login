package com.mobile.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.mobile.service.BackgroundService

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

            // 检查是否启用了开机自启（从 SharedPreferences 读取）
            val prefs = context.getSharedPreferences("netmate_settings", Context.MODE_PRIVATE)
            val autoStartEnabled = prefs.getBoolean("auto_start_on_boot", false)

            if (autoStartEnabled) {
                Log.d(TAG, "Auto-start enabled, starting background service...")

                val serviceIntent = Intent(context, BackgroundService::class.java).apply {
                    action = BackgroundService.ACTION_START
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            } else {
                Log.d(TAG, "Auto-start disabled, skipping service start")
            }
        }
    }
}
