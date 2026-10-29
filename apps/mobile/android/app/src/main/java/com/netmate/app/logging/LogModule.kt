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
    @ReactMethod fun queryHistory(json: String, promise: Promise) {
        try { promise.resolve(NetMateLogs.queryHistory(context, JSONObject(json)).toNativeMap()) }
        catch (_: Exception) { promise.reject("LOG_READ", "日志读取失败，请刷新重试") }
    }
    @ReactMethod fun copy(text: String, promise: Promise) {
        val clipboard = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        clipboard.setPrimaryClip(android.content.ClipData.newPlainText("NetMate 日志", LogJournal.safe(text)))
        promise.resolve(true)
    }
    @ReactMethod fun export(promise: Promise) = exportHistory("text", "{}", promise)
    @ReactMethod fun exportHistory(format: String, filter: String, promise: Promise) {
        try {
            val entries = NetMateLogs.history(context, JSONObject(filter))
            val info = JSONObject().put("os", JSONObject().put("platform", "Android").put("release", android.os.Build.VERSION.RELEASE).put("sdk", android.os.Build.VERSION.SDK_INT))
                .put("app", JSONObject().put("version", context.packageManager.getPackageInfo(context.packageName, 0).versionName))
                .put("device", JSONObject().put("manufacturer", android.os.Build.MANUFACTURER).put("model", android.os.Build.MODEL))
            val meta = JSONObject().put("appName", "NetMate").put("exportedAt", java.time.Instant.now().toString()).put("totalEntries", entries.size)
                .put("timeRange", JSONObject().put("from", entries.lastOrNull()?.optLong("timestamp")).put("to", entries.firstOrNull()?.optLong("timestamp")))
            val content = if (format == "json") JSONObject().put("meta", meta).put("systemInfo", info).put("entries", org.json.JSONArray(entries)).toString(2)
                else listOf("NetMate 诊断日志", "导出时间: ${meta.getString("exportedAt")}", "日志记录 (共 ${entries.size} 条)", "系统与应用信息: $info").joinToString("\n") + "\n" + entries.joinToString("\n") {
                    val labels = mapOf("info" to "信息", "success" to "成功", "warn" to "警告", "error" to "错误", "debug" to "调试")
                    "[${java.time.Instant.ofEpochMilli(it.getLong("timestamp"))}] [${labels[it.optString("level")] ?: "信息"}] [${it.optString("source", "app")}] ${it.optString("message")}" + if (it.has("data")) "\n${it.opt("data")}" else ""
                }
            val directory = File(context.cacheDir, "exports").apply { mkdirs() }
            val file = File(directory, "NetMate-diagnostic.${if (format == "json") "json" else "log"}")
            file.writeText(content)
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
            val share = Intent(Intent.ACTION_SEND).setType(if (format == "json") "application/json" else "text/plain").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            context.startActivity(Intent.createChooser(share, "导出诊断日志").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            promise.resolve(true)
        } catch (_: Exception) { promise.reject("LOG_EXPORT", "日志导出失败，请重试") }
    }
    @ReactMethod fun addListener(name: String) = Unit
    @ReactMethod fun removeListeners(count: Double) = Unit
}
