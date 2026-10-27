package com.netmate.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.netmate.app.logging.NetMateLogs
import com.netmate.app.auth.AutoAuthStore
import com.netmate.app.auth.AutoAuthWorker
import com.netmate.app.service.BackgroundService

/**
 * 开机自启广播接收器
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {

            NetMateLogs.log(context, "debug", "开机完成，检查后台服务配置", "boot")

            // 自动认证的 WorkManager 兜底不依赖开机自启开关，只要开启了自动认证就恢复
            if (AutoAuthStore.loadProfile(context)?.enabled == true) {
                AutoAuthWorker.schedule(context)
            }

            // 检查是否启用了开机自启（从 SharedPreferences 读取）
            val prefs = context.getSharedPreferences("netmate_settings", Context.MODE_PRIVATE)
            val autoStartEnabled = prefs.getBoolean("auto_start_on_boot", false)

            if (autoStartEnabled) {
                NetMateLogs.log(context, "info", "开机自启已启用，启动后台服务", "boot")

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
                    NetMateLogs.log(context, "warn", "系统未允许开机启动后台服务，已保留周期任务兜底", "boot")
                }
            } else {
                NetMateLogs.log(context, "debug", "开机自启已关闭", "boot")
            }
        }
    }
}
