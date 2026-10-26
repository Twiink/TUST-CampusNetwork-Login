package com.netmate.app.permission

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 权限与系统设置跳转模块。
 * 运行时权限（定位、通知、后台定位）由 JS 侧 PermissionsAndroid 申请；
 * 这里补充 PermissionsAndroid 覆盖不到的部分：电池优化白名单、厂商自启动设置页、应用详情页。
 */
class PermissionModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PermissionModule"

    /**
     * 常见国产系统的自启动/后台管理页面。厂商随系统版本改过包名或类名，
     * 逐个尝试，能解析到 Activity 的才启动；都失败时回退到应用详情页。
     */
    private val autoStartIntents: List<ComponentName> = listOf(
        // 小米 / Redmi (MIUI / HyperOS)
        ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
        // 华为 / 荣耀 (EMUI / HarmonyOS / MagicOS)
        ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
        ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"),
        ComponentName("com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
        // OPPO / 一加 / realme (ColorOS)
        ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
        ComponentName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
        ComponentName("com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity"),
        // vivo / iQOO (OriginOS / Funtouch)
        ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
        ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"),
        // 魅族
        ComponentName("com.meizu.safe", "com.meizu.safe.permission.SmartBGActivity"),
        // 三星
        ComponentName("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"),
    )

    /** 是否已加入电池优化白名单（Android 6.0 以下没有该机制，视为已允许） */
    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            val powerManager = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            promise.resolve(powerManager.isIgnoringBatteryOptimizations(reactApplicationContext.packageName))
        } catch (e: Exception) {
            promise.reject("PERMISSION_ERROR", "Failed to check battery optimization: ${e.message}", e)
        }
    }

    /**
     * 弹出系统「允许应用始终在后台运行」对话框；用户的选择需在返回应用后重新查询。
     * 部分 ROM 不支持该对话框，回退到电池优化列表页。
     */
    @SuppressLint("BatteryLife")
    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        val packageUri = Uri.parse("package:${reactApplicationContext.packageName}")
        val opened = startActivitySafely(
            Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, packageUri)
        ) || startActivitySafely(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        promise.resolve(opened)
    }

    /** 当前设备是否有已知的厂商自启动管理页 */
    @ReactMethod
    fun hasAutoStartSettings(promise: Promise) {
        promise.resolve(autoStartIntents.any { resolvable(Intent().setComponent(it)) })
    }

    /** 打开厂商自启动管理页；没有时打开应用详情页。resolve 实际打开的页面类型 */
    @ReactMethod
    fun openAutoStartSettings(promise: Promise) {
        for (component in autoStartIntents) {
            val intent = Intent().setComponent(component)
            if (resolvable(intent) && startActivitySafely(intent)) {
                promise.resolve("vendor")
                return
            }
        }
        promise.resolve(if (openAppDetails()) "app" else "none")
    }

    /** 打开本应用详情页（用于在 Android 11+ 授予「始终允许」后台定位，或重新开启被永久拒绝的权限） */
    @ReactMethod
    fun openAppSettings(promise: Promise) {
        promise.resolve(openAppDetails())
    }

    @ReactMethod
    fun getManufacturer(promise: Promise) {
        promise.resolve(Build.MANUFACTURER ?: "")
    }

    private fun openAppDetails(): Boolean = startActivitySafely(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${reactApplicationContext.packageName}"))
    )

    private fun resolvable(intent: Intent): Boolean =
        intent.resolveActivity(reactApplicationContext.packageManager) != null

    private fun startActivitySafely(intent: Intent): Boolean {
        val activity = reactApplicationContext.currentActivity
        return try {
            if (activity != null) {
                activity.startActivity(intent)
            } else {
                reactApplicationContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            true
        } catch (e: ActivityNotFoundException) {
            false
        } catch (e: SecurityException) {
            // 部分厂商页面未导出，第三方应用无权启动
            false
        }
    }
}
