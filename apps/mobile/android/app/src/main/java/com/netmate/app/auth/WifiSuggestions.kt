package com.netmate.app.auth

import android.content.Context
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSuggestion
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject

/** Only app-owned suggestions are managed here; user-saved system networks are independent. */
object WifiSuggestions {
    private val temporary = linkedMapOf<String, AutoAuthWifiRule>()
    private val expiry = Handler(Looper.getMainLooper())
    private var initialized = false
    @Volatile var addPort: ((List<WifiNetworkSuggestion>) -> Int)? = null
    @Volatile var queryPort: (() -> List<WifiNetworkSuggestion>)? = null
    @Volatile var removePort: ((List<WifiNetworkSuggestion>) -> Int)? = null
    private fun sameSuggestion(left: AutoAuthWifiRule, right: AutoAuthWifiRule) =
        left.ssid == right.ssid && left.password == right.password && left.priority == right.priority &&
        WifiSecurity.normalize(left.security) == WifiSecurity.normalize(right.security) && WifiSecurity.bssid(left.bssid) == WifiSecurity.bssid(right.bssid)
    private fun manager(context: Context) = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

    @Synchronized fun reconcile(context: Context, profile: AutoAuthProfile, configChanged: Boolean = false) {
        if (Build.VERSION.SDK_INT < 29) return
        if (configChanged) temporary.clear()
        val previous = AutoAuthStore.suggestionRules(context)
        val wanted = (if (profile.enabled) profile.autoConnectWifis else emptyList()) + temporary.values
        val distinct = wanted.distinctBy { Triple(it.ssid, WifiSecurity.normalize(it.security), WifiSecurity.bssid(it.bssid)) }
        val wifi = manager(context)
        val applied = if (Build.VERSION.SDK_INT >= 30 && WifiEnvironment.connectPort == null) (queryPort?.invoke() ?: wifi.networkSuggestions) else if (Build.VERSION.SDK_INT >= 30) queryPort?.invoke() else null
        if (!initialized && previous == null && applied == null) {
            val cleared = removePort?.invoke(emptyList()) ?: wifi.removeNetworkSuggestions(emptyList())
            check(cleared == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS || cleared == WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_REMOVE_INVALID) { "无法清理旧 WiFi 建议，请确认系统授权后重试" }
        }
        val old = previous.orEmpty()
        val removed = if (applied != null) applied.filter { suggestion -> distinct.none { WifiConnector.suggestion(context, it) == suggestion } }
            else old.filter { previousRule -> distinct.none { sameSuggestion(it, previousRule) } }.map { WifiConnector.suggestion(context, it) }
        if (removed.isNotEmpty()) {
            val result = removePort?.invoke(removed) ?: wifi.removeNetworkSuggestions(removed)
            check(result == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS || result == WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_REMOVE_INVALID) { "WiFi 建议撤销失败，请重试同步" }
        }
        val added = distinct.filter { wantedRule -> old.none { sameSuggestion(it, wantedRule) } || applied?.contains(WifiConnector.suggestion(context, wantedRule)) == false }.map { WifiConnector.suggestion(context, it) }
        if (added.isNotEmpty()) {
            val result = addPort?.invoke(added) ?: wifi.addNetworkSuggestions(added)
            check(result == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS) { "WiFi 建议未获系统接受，请确认授权后重试" }
        }
        AutoAuthStore.saveSuggestionRules(context, distinct)
        initialized = true
    }

    @Synchronized fun request(context: Context, rule: AutoAuthWifiRule) {
        val profile = AutoAuthStore.loadProfile(context) ?: AutoAuthProfile(false, null, emptyList(), emptyList())
        if (profile.enabled && profile.autoConnectWifis.any { it.id == rule.id }) { reconcile(context, profile); return }
        temporary[rule.id] = rule
        reconcile(context, profile)
        expiry.postDelayed({ runCatching { expire(context, rule.id, onlyDisconnected = true) }.onFailure { com.netmate.app.logging.NetMateLogs.log(context, "warn", "临时网络建议清理失败，请重新同步配置", "wifi") } }, 35_000L)
    }
    @Synchronized fun expire(context: Context, id: String? = null, onlyDisconnected: Boolean = false) {
        val state = WifiEnvironment.snapshot(context)
        val removed = temporary.entries.removeAll { (key, rule) -> (id == null || key == id) && (!onlyDisconnected || !state.connected || state.ssid != rule.ssid || (!rule.bssid.isNullOrBlank() && WifiSecurity.bssid(state.bssid) != WifiSecurity.bssid(rule.bssid))) }
        if (removed) reconcile(context, AutoAuthStore.loadProfile(context) ?: AutoAuthProfile(false, null, emptyList(), emptyList()))
    }
    fun encode(rules: List<AutoAuthWifiRule>): String = JSONArray().apply { rules.forEach { put(JSONObject().put("id", it.id).put("ssid", it.ssid).put("password", it.password).put("security", it.security).put("bssid", it.bssid).put("autoConnect", it.autoConnect).put("priority", it.priority)) } }.toString()
}
