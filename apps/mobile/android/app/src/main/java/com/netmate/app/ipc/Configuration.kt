package com.netmate.app.ipc
import android.content.Context
import com.netmate.app.auth.*
import com.netmate.app.service.BackgroundService
import org.json.JSONArray
import org.json.JSONObject

/** Sole configuration writer, instantiated only in the network service. */
internal class Configuration(private val context: Context) {
    private var data = AutoAuthStore.rawJson(context)?.let(::JSONObject) ?: JSONObject().put("schema", 1).put("revision", 0).put("enabled", true).put("heartbeatEnabled", true).put("heartbeatIntervalSeconds", 30).put("failureThreshold", 3).put("wifiRetries", 3).put("wifiCooldownMinutes", 5).put("keepCurrentConnection", true).put("autoUpdate", true).put("accounts", JSONArray()).put("wifiRules", JSONArray())
    private fun refresh(){AutoAuthStore.rawJson(context)?.let{data=JSONObject(it)}}
    fun publicData(): JSONObject {refresh();return JSONObject(data.toString()).apply {
        listOf("accounts", "wifiRules").forEach { field -> val entries = getJSONArray(field); for (i in 0 until entries.length()) { val entry = entries.getJSONObject(i); entry.put("hasPassword", entry.optString("password").isNotEmpty()); entry.remove("password") } }
    } }
    fun save(input: JSONObject): JSONObject {
        refresh()
        require(input.optLong("revision") == data.optLong("revision")) { "配置已变化，请刷新后重试" }
        val next = JSONObject(input.toString()).put("revision", data.optLong("revision") + 1)
        listOf("accounts", "wifiRules").forEach { field ->
            val old = data.getJSONArray(field); val entries = next.getJSONArray(field)
            require(entries.length() <= 100) { "配置条目过多" }
            val ids = mutableSetOf<String>()
            for (i in 0 until entries.length()) {
                val entry = entries.getJSONObject(i); val id = entry.getString("id")
                require(id.isNotBlank() && id.length <= 128 && ids.add(id)) { "配置 ID 无效或重复" }
                val previous = (0 until old.length()).map(old::getJSONObject).firstOrNull { it.optString("id") == id }?.optString("password").orEmpty()
                val edit = entry.optJSONObject("passwordEdit")
                val password = when (edit?.optString("action")) { null, "keep" -> previous; "clear" -> ""; "replace" -> edit.getString("value"); else -> error("密码操作无效") }
                require(password.length <= 2048) { "密码过长" }
                entry.put("password", password); entry.remove("passwordEdit"); entry.remove("hasPassword")
                if (field == "accounts") { require(entry.getString("username").isNotBlank()); val uri = android.net.Uri.parse(entry.getString("serverUrl")); require(uri.scheme in listOf("http", "https") && uri.host != null && uri.userInfo == null && uri.query == null) { "认证服务器地址无效" } }
                else require(entry.getString("ssid").toByteArray().size in 1..32 && entry.optInt("priority", 10) in 1..99) { "WiFi 名称或优先级无效" }
            }
        }
        require(next.toString().toByteArray().size <= 192 * 1024) { "配置过大，请减少条目或内容" }
        val before = AutoAuthStore.loadProfile(context)
        val profile = AutoAuthStore.saveProfile(context, next.toString()) { candidate -> WifiSuggestions.reconcile(context, candidate, before?.wifiRules != candidate.wifiRules || before?.enabled != candidate.enabled) }
        data = next
        context.getSharedPreferences("netmate_native_settings_v1", Context.MODE_PRIVATE).edit().putBoolean("auto_start_on_boot", next.optBoolean("autoLaunch")).apply()
        BackgroundService.configurationChanged()
        AutoAuthEngine.resetBackoff()
        if (profile.enabled) AutoAuthWorker.schedule(context) else { AutoAuthWorker.cancel(context); AutoAuthEngine.stopReconnect(context) }
        return publicData()
    }
    fun pause(paused: Boolean) { refresh();val next=JSONObject(data.toString()).put("authPaused",paused).put("revision",data.optLong("revision")+1);AutoAuthStore.saveProfile(context,next.toString());data=next }
}
