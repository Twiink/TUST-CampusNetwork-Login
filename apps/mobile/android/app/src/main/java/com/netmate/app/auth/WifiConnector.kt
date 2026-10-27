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
    fun connect(context: Context, ssid: String, password: String?): Boolean {
        if (ssid.isBlank()) return false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val builder = WifiNetworkSuggestion.Builder()
                .setSsid(ssid)
                .setIsAppInteractionRequired(false)
            if (!password.isNullOrBlank()) {
                builder.setWpa2Passphrase(password)
            }
            val suggestion = builder.build()
            // Keep API-specific request construction in device tests; replace the radio submission only.
            WifiEnvironment.connectPort?.let { return it(context, ssid, password) }
            val status = wifiManager(context).addNetworkSuggestions(listOf(suggestion))
            // 重复建议同一网络视为成功（重试时会再次提交）
            return status == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS ||
                status == WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_ADD_DUPLICATE
        }

        @Suppress("DEPRECATION")
        val wifiConfig = WifiConfiguration().apply {
            SSID = "\"${ssid.replace("\\", "\\\\").replace("\"", "\\\"")}\""
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

    fun openSelection(context: Context, ssid: String, password: String?) {
        if (Build.VERSION.SDK_INT < 29 || WifiEnvironment.connectPort != null) return
        val intent = if (Build.VERSION.SDK_INT >= 30) {
            val suggestion = WifiNetworkSuggestion.Builder().setSsid(ssid).apply { if (!password.isNullOrBlank()) setWpa2Passphrase(password) }.build()
            android.content.Intent(android.provider.Settings.ACTION_WIFI_ADD_NETWORKS)
                .putParcelableArrayListExtra(android.provider.Settings.EXTRA_WIFI_NETWORK_LIST, arrayListOf(suggestion))
        } else android.content.Intent(android.provider.Settings.Panel.ACTION_WIFI)
        context.startActivity(intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    fun state(context: Context): WifiState {
        val state = WifiEnvironment.snapshot(context)
        return WifiState(state.enabled, state.connected, state.ssid)
    }

    private fun wifiManager(context: Context): WifiManager =
        context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
}
