package com.mobile.receiver

import android.content.Context
import com.facebook.react.bridge.*

/**
 * 开机自启设置模块
 */
class AutoStartModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AutoStartModule"

    private val prefs by lazy {
        reactApplicationContext.getSharedPreferences("netmate_settings", Context.MODE_PRIVATE)
    }

    /**
     * 获取开机自启状态
     */
    @ReactMethod
    fun isEnabled(promise: Promise) {
        val enabled = prefs.getBoolean("auto_start_on_boot", false)
        promise.resolve(enabled)
    }

    /**
     * 设置开机自启状态
     */
    @ReactMethod
    fun setEnabled(enabled: Boolean, promise: Promise) {
        try {
            prefs.edit().putBoolean("auto_start_on_boot", enabled).apply()
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("AUTOSTART_ERROR", "Failed to set auto-start: ${e.message}", e)
        }
    }
}
