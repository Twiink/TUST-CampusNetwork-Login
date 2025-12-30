package com.mobile.service

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.*

/**
 * 后台服务 React Native 模块
 */
class BackgroundServiceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "BackgroundServiceModule"

    /**
     * 启动后台服务
     */
    @ReactMethod
    fun startService(interval: Double, promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, BackgroundService::class.java).apply {
                action = BackgroundService.ACTION_START
                putExtra("interval", interval.toLong())
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SERVICE_ERROR", "Failed to start service: ${e.message}", e)
        }
    }

    /**
     * 停止后台服务
     */
    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, BackgroundService::class.java).apply {
                action = BackgroundService.ACTION_STOP
            }
            reactApplicationContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SERVICE_ERROR", "Failed to stop service: ${e.message}", e)
        }
    }

    /**
     * 检查服务是否正在运行
     */
    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(BackgroundService.isServiceRunning())
    }
}
