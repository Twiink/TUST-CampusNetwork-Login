package com.netmate.app.auth

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build

/** Hardware boundary shared by the bridge and background engine. Test builds install controlled ports. */
object WifiEnvironment {
    data class Snapshot(
        val enabled: Boolean,
        val connected: Boolean,
        val ssid: String? = null,
        val ipv4: String? = null,
        val ipv6: String? = null,
        val network: Network? = null,
        val key: String = "none",
        val validated: Boolean = false,
        val captive: Boolean = false,
        val signal: Int? = null,
        val bssid: String? = null,
        val frequency: Int? = null,
        val linkSpeed: Int? = null,
        val gateway: String? = null,
        val dns: List<String> = emptyList(),
    )
    @Volatile var snapshotPort: ((Context) -> Snapshot)? = null
    @Volatile var connectPort: ((Context, String, String?) -> Boolean)? = null
    @Volatile var scanPort: (() -> List<Triple<String, Int, String>>)? = null

    private val knownSsids = java.util.concurrent.ConcurrentHashMap<Long, String>()
    fun rememberSsid(network: Network, ssid: String) { knownSsids[network.networkHandle] = ssid }

    fun snapshot(context: Context): Snapshot = snapshotPort?.invoke(context) ?: systemSnapshot(context)

    private fun systemSnapshot(context: Context): Snapshot {
        val app = context.applicationContext
        val manager = app.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val wifi = app.getSystemService(Context.WIFI_SERVICE) as WifiManager
        // activeNetwork is the default route, which can still be cellular during portal authentication.
        val network = LocalAddresses.wifiNetworks(manager).firstOrNull()
            ?: return Snapshot(enabled = wifi.isWifiEnabled, connected = false)
        val capabilities = manager.getNetworkCapabilities(network)
        val properties = manager.getLinkProperties(network)
        @Suppress("DEPRECATION")
        val info = if (Build.VERSION.SDK_INT >= 29) (capabilities?.transportInfo as? WifiInfo) ?: wifi.connectionInfo else wifi.connectionInfo
        val ssid = info?.ssid?.removeSurrounding("\"")?.takeIf { it.isNotBlank() && it != WifiManager.UNKNOWN_SSID && it != "0x" }?.also { knownSsids[network.networkHandle] = it } ?: knownSsids[network.networkHandle]
        val addresses = properties?.linkAddresses?.map { it.address } ?: emptyList()
        val ipv4 = LocalAddresses.selectIPv4(addresses)
        val ipv6 = LocalAddresses.selectIPv6(addresses)
        return Snapshot(
            enabled = wifi.isWifiEnabled, connected = true, ssid = ssid, ipv4 = ipv4, ipv6 = ipv6,
            network = network, key = "${network.networkHandle}:${ssid ?: ""}:${ipv4 ?: ""}",
            validated = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true,
            captive = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_CAPTIVE_PORTAL) == true,
            signal = info?.rssi?.let { ((it + 100) * 100 / 60).coerceIn(0, 100) },
            bssid = info?.bssid, frequency = info?.frequency, linkSpeed = info?.linkSpeed,
            gateway = properties?.routes?.firstOrNull { it.isDefaultRoute }?.gateway?.hostAddress,
            dns = properties?.dnsServers?.mapNotNull { it.hostAddress } ?: emptyList(),
        )
    }
}
