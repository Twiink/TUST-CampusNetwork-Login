package com.netmate.app.auth

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiConfiguration
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSuggestion
import android.os.Build

/**
 * WiFi 连接能力封装。
 *
 * Android 10+ 普通应用不能强制连接指定 WiFi，只能通过 WifiNetworkSuggestion 向系统「建议」网络：
 * 首次建议时系统会询问用户是否允许本应用建议网络；允许后，系统在该网络可用时自行连接。
 * Android 9 及以下使用旧版 addNetwork + enableNetwork 直接连接。
 */
object WifiConnector {

    data class WifiState(val enabled: Boolean, val connected: Boolean, val ssid: String?)

    /** 提交连接请求；返回系统是否接受（不代表已连上） */
    fun connect(context: Context, ssid: String, password: String?, security: String? = null, bssid: String? = null, manual: Boolean = false, ruleId: String = ssid): Boolean {
        if (ssid.isBlank()) return false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val rule = AutoAuthWifiRule(ssid, false, emptyList(), password.orEmpty(), id = ruleId, security = security, bssid = bssid)
            suggestion(context, rule)
            WifiEnvironment.connectPort?.let { return it(context, ssid, password) }
            if (manual) WifiSuggestions.request(context, rule)
            else AutoAuthStore.loadProfile(context)?.let { WifiSuggestions.reconcile(context, it) }
                ?: return false
            return true
        }

        require(WifiSecurity.normalize(security) !in setOf("wpa3", "enterprise", "wep")) { "此安全类型请通过系统 WiFi 设置连接" }
        @Suppress("DEPRECATION")
        val wifiConfig = WifiConfiguration().apply {
            SSID = "\"${ssid.replace("\\", "\\\\").replace("\"", "\\\"")}\""
            BSSID = bssid
            status = WifiConfiguration.Status.ENABLED
            priority = 40
            if (password.isNullOrBlank()) {
                allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
            } else {
                preSharedKey = "\"$password\""
                allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK)
            }
        }
        WifiEnvironment.connectPort?.let { return it(context, ssid, password) }
        val wifiManager = wifiManager(context)
        @Suppress("DEPRECATION")
        val networkId = wifiManager.addNetwork(wifiConfig)
        if (networkId == -1) return false
        @Suppress("DEPRECATION")
        wifiManager.disconnect()
        @Suppress("DEPRECATION")
        wifiManager.enableNetwork(networkId, true)
        @Suppress("DEPRECATION")
        wifiManager.reconnect()
        return true
    }

    fun openSelection(context: Context, ssid: String, password: String?, security: String? = null, bssid: String? = null) {
        if (Build.VERSION.SDK_INT < 29 || WifiEnvironment.connectPort != null) return
        val intent = if (Build.VERSION.SDK_INT >= 30) {
            val suggestion = suggestion(context, AutoAuthWifiRule(ssid, false, emptyList(), password.orEmpty(), security = security, bssid = bssid))
            android.content.Intent(android.provider.Settings.ACTION_WIFI_ADD_NETWORKS)
                .putParcelableArrayListExtra(android.provider.Settings.EXTRA_WIFI_NETWORK_LIST, arrayListOf(suggestion))
        } else android.content.Intent(android.provider.Settings.Panel.ACTION_WIFI)
        context.startActivity(intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun suggestion(context: Context, rule: AutoAuthWifiRule): WifiNetworkSuggestion {
        check(Build.VERSION.SDK_INT >= 29)
        val builder = WifiNetworkSuggestion.Builder().setSsid(rule.ssid).setIsAppInteractionRequired(false)
        val type = WifiSecurity.normalize(rule.security).ifEmpty { if (rule.password.isEmpty()) "open" else "wpa2" }
        when (type) {
            "open" -> require(rule.password.isEmpty()) { "开放网络不应设置密码" }
            "wpa2" -> builder.setWpa2Passphrase(rule.password)
            "wpa3" -> {
                require(wifiManager(context).isWpa3SaeSupported) { "设备不支持 WPA3，请使用系统 WiFi 设置" }
                builder.setWpa3Passphrase(rule.password)
            }
            "wpa2-wpa3" -> if (wifiManager(context).isWpa3SaeSupported) builder.setWpa3Passphrase(rule.password) else builder.setWpa2Passphrase(rule.password)
            else -> throw IllegalArgumentException("此安全类型请通过系统 WiFi 设置连接")
        }
        if (!rule.bssid.isNullOrBlank()) builder.setBssid(android.net.MacAddress.fromString(rule.bssid))
        builder.setPriority((100 - rule.priority).coerceIn(0, 99))
        return builder.build()
    }

    fun state(context: Context): WifiState {
        val state = WifiEnvironment.snapshot(context)
        return WifiState(state.enabled, state.connected, state.ssid)
    }

    private fun wifiManager(context: Context): WifiManager =
        context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
}
