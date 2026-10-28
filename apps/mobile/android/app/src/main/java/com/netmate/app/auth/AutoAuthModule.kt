package com.netmate.app.auth

import com.facebook.react.bridge.Arguments
import com.netmate.app.bridge.toNativeMap
import org.json.JSONObject
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * 自动认证 React Native 模块。
 * - syncProfile：JS 在配置变化时同步账号与 WiFi 规则（加密落盘），并按开关调度 WorkManager 兜底
 * - checkNow：前台触发一次检查，与后台服务共用同一串行引擎，避免重复登录
 * - 结果通过 netmate:autoAuthResult 事件推送给 JS
 */
class AutoAuthModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val EVENT_RESULT = "netmate:autoAuthResult"
    }

    override fun getName(): String = "AutoAuthModule"

    private val resultListener: (AutoAuthResult) -> Unit = { result ->
        if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT_RESULT, result.toWritableMap())
        }
    }

    private val statusListener: (JSONObject) -> Unit = { value ->
        if (reactApplicationContext.hasActiveReactInstance()) reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("netmate:authSnapshot", value.toNativeMap())
    }
    private val progressListener: (JSONObject) -> Unit = { value ->
        if (reactApplicationContext.hasActiveReactInstance()) reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("netmate:wifiReconnectProgress", value.toNativeMap())
    }
    override fun initialize() {
        super.initialize()
        AutoAuthEngine.addListener(resultListener)
        AutoAuthEngine.statusListeners.add(statusListener)
        ReconnectEvents.listeners.add(progressListener)
    }

    override fun invalidate() {
        AutoAuthEngine.removeListener(resultListener)
        AutoAuthEngine.statusListeners.remove(statusListener)
        ReconnectEvents.listeners.remove(progressListener)
        super.invalidate()
    }

    @ReactMethod
    fun syncProfile(json: String, promise: Promise) {
        try {
            val before = AutoAuthStore.loadProfile(reactApplicationContext)
            val profile = AutoAuthStore.saveProfile(reactApplicationContext, json)
            com.netmate.app.service.BackgroundService.configurationChanged()
            WifiSuggestions.reconcile(reactApplicationContext, profile, before?.wifiRules != profile.wifiRules || before?.enabled != profile.enabled)
            if (before == null || before.enabled != profile.enabled || before.wifiRules != profile.wifiRules || before.wifiCooldownMinutes != profile.wifiCooldownMinutes || before.wifiRetries != profile.wifiRetries) {
                AutoAuthEngine.resetBackoff()
                if (!profile.enabled || profile.autoConnectWifis.isEmpty()) AutoAuthEngine.stopReconnect(reactApplicationContext)
                else AutoAuthEngine.onStartup(reactApplicationContext)
            }
            if (profile.enabled) {
                AutoAuthWorker.schedule(reactApplicationContext)
            } else {
                AutoAuthWorker.cancel(reactApplicationContext)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("AUTO_AUTH_ERROR", if (e is IllegalArgumentException || e is IllegalStateException) e.message ?: "请重试同步配置" else "配置未能同步到后台，请重试保存或重新打开应用")
        }
    }

    /** resolve 本次结果；无需登录时 resolve null */
    @ReactMethod
    fun checkNow(trigger: String, promise: Promise) {
        val future = AutoAuthEngine.checkAsync(reactApplicationContext, trigger)
        Thread {
            try {
                promise.resolve(future.get()?.toWritableMap())
            } catch (e: Exception) {
                promise.reject("AUTO_AUTH_ERROR", "认证检查失败，请确认 WiFi 与网络权限")
            }
        }.start()
    }

    @ReactMethod fun login(promise: Promise) { AutoAuthStore.resume(reactApplicationContext); checkNow(AutoAuthEngine.TRIGGER_MANUAL, promise) }
    @ReactMethod fun logout(promise: Promise) {
        val future = AutoAuthEngine.logoutAsync(reactApplicationContext)
        Thread {
            try { promise.resolve(future.get().toWritableMap()) }
            catch (_: Exception) { promise.reject("AUTH_LOGOUT", "注销失败，自动认证保持暂停") }
        }.start()
    }
    @ReactMethod fun getSnapshot(promise: Promise) {
        promise.resolve(AutoAuthEngine.snapshot(reactApplicationContext).toNativeMap())
        AutoAuthEngine.checkAsync(reactApplicationContext, "status")
    }
    @ReactMethod fun getReconnectProgress(promise: Promise) { promise.resolve(ReconnectEvents.latest.toNativeMap()) }

    @ReactMethod
    fun getLastResult(promise: Promise) {
        promise.resolve(AutoAuthStore.loadLastResult(reactApplicationContext)?.toWritableMap())
    }

    // NativeEventEmitter 要求的空实现
    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) = Unit

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Double) = Unit

    private fun AutoAuthResult.toWritableMap(): WritableMap = Arguments.createMap().apply {
        if (networkKey != null) putString("networkKey", networkKey)
        putBoolean("success", success)
        putString("message", message)
        putString("trigger", trigger)
        if (username != null) putString("username", username) else putNull("username")
        putInt("attempts", attempts)
        putDouble("timestamp", timestamp.toDouble())
    }
}
