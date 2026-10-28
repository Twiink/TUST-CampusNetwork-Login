package com.netmate.app.logging

import android.content.Intent
import androidx.core.content.FileProvider
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.netmate.app.bridge.toNativeMap
import org.json.JSONObject
import java.io.File

class LogModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "LogModule"
    private val listener: (JSONObject) -> Unit = { entry -> if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("netmate:logAdded", entry.toNativeMap()) }
    override fun initialize() { super.initialize(); NetMateLogs.initialize(context); NetMateLogs.listeners.add(listener) }
    override fun invalidate() { NetMateLogs.listeners.remove(listener); super.invalidate() }
    @ReactMethod fun append(json: String, promise: Promise) {
        try { promise.resolve(NetMateLogs.append(context, JSONObject(json)).toNativeMap()) }
        catch (_: Exception) { promise.reject("LOG_WRITE", "日志保存失败") }
    }
    @ReactMethod fun query(level: String?, limit: Int, offset: Int, promise: Promise) {
        try {
            val array = Arguments.createArray()
            NetMateLogs.query(context, level, limit, offset).forEach { array.pushMap(it.toNativeMap()) }
            promise.resolve(array)
        } catch (_: Exception) { promise.reject("LOG_READ", "日志读取失败") }
    }
    @ReactMethod fun clear(promise: Promise) { try { promise.resolve(NetMateLogs.clear(context)) } catch (_: Exception) { promise.reject("LOG_CLEAR", "日志清空失败") } }
    @ReactMethod fun queryPage(cursor: String?, limit: Int, promise: Promise) {
        try { promise.resolve(NetMateLogs.queryPage(context, cursor, limit).toNativeMap()) }
        catch (_: Exception) { promise.reject("LOG_READ", "日志读取失败") }
    }
    @ReactMethod fun export(promise: Promise) {
        try {
            val directory = File(context.cacheDir, "exports").apply { mkdirs() }
            directory.listFiles()?.forEach { it.delete() }
            val file = File(directory, "NetMate-diagnostic.log")
            file.writeText(NetMateLogs.query(context, null, 100_000).joinToString("\n") { it.toString() })
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
            val share = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            context.startActivity(Intent.createChooser(share, "导出诊断日志").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            promise.resolve(true)
        } catch (_: Exception) { promise.reject("LOG_EXPORT", "日志导出失败，请重试") }
    }
    @ReactMethod fun addListener(name: String) = Unit
    @ReactMethod fun removeListeners(count: Double) = Unit
}
