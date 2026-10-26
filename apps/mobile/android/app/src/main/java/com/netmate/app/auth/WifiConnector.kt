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
        val wifiManager = wifiManager(context)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val builder = WifiNetworkSuggestion.Builder()
                .setSsid(ssid)
                .setIsAppInteractionRequired(false)
            if (!password.isNullOrBlank()) {
                builder.setWpa2Passphrase(password)
            }
            val status = wifiManager.addNetworkSuggestions(listOf(builder.build()))
            // 重复建议同一网络视为成功（重试时会再次提交）
            return status == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS ||
                status == WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_ADD_DUPLICATE
        }

        @Suppress("DEPRECATION")
        val wifiConfig = WifiConfiguration().apply {
            SSID = "\"$ssid\""
            status = WifiConfiguration.Status.ENABLED
            priority = 40
            if (password.isNullOrBlank()) {
                allowedKeyManagement.set(WifiConfiguration.KeyMgmt.NONE)
            } else {
                preSharedKey = "\"$password\""
                allowedKeyManagement.set(WifiConfiguration.KeyMgmt.WPA_PSK)
            }
        }
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

    fun state(context: Context): WifiState {
        val wifiManager = wifiManager(context)
        val connectivityManager =
            context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = LocalAddresses.wifiNetworks(connectivityManager).firstOrNull { candidate ->
            connectivityManager.getNetworkCapabilities(candidate)
                ?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        }
        val ssid = network?.let { AutoAuthEngine.readSsid(context, it) }
        return WifiState(enabled = wifiManager.isWifiEnabled, connected = network != null, ssid = ssid)
    }

    private fun wifiManager(context: Context): WifiManager =
        context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
}
