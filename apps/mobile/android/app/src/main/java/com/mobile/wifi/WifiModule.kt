package com.mobile.wifi

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import java.net.Inet4Address
import java.net.NetworkInterface

class WifiModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WifiModule"

    private val wifiManager: WifiManager by lazy {
        reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    }

    private val connectivityManager: ConnectivityManager by lazy {
        reactApplicationContext.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    }

    /**
     * 检查是否有位置权限（Android 8.0+ 获取 WiFi SSID 需要位置权限）
     */
    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * 获取当前连接的 WiFi SSID
     */
    @ReactMethod
    fun getCurrentSSID(promise: Promise) {
        try {
            if (!hasLocationPermission()) {
                promise.resolve(null)
                return
            }

            @Suppress("DEPRECATION")
            val wifiInfo = wifiManager.connectionInfo
            val ssid = wifiInfo?.ssid

            if (ssid == null || ssid == "<unknown ssid>" || ssid == "0x") {
                promise.resolve(null)
            } else {
                // 去掉 SSID 两端的引号
                promise.resolve(ssid.replace("\"", ""))
            }
        } catch (e: Exception) {
            promise.reject("WIFI_ERROR", "Failed to get SSID: ${e.message}", e)
        }
    }

    /**
     * 获取当前设备的 IPv4 地址
     */
    @ReactMethod
    fun getIPAddress(promise: Promise) {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val networkInterface = interfaces.nextElement()
                val addresses = networkInterface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val address = addresses.nextElement()
                    if (!address.isLoopbackAddress && address is Inet4Address) {
                        promise.resolve(address.hostAddress)
                        return
                    }
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("NETWORK_ERROR", "Failed to get IP address: ${e.message}", e)
        }
    }

    /**
     * 获取当前设备的 IPv6 地址
     */
    @ReactMethod
    fun getIPv6Address(promise: Promise) {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val networkInterface = interfaces.nextElement()
                val addresses = networkInterface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val address = addresses.nextElement()
                    if (!address.isLoopbackAddress && address.hostAddress?.contains(":") == true) {
                        // 去掉 scope id (如 %wlan0)
                        val ipv6 = address.hostAddress?.split("%")?.get(0)
                        if (ipv6 != null && !ipv6.startsWith("fe80")) { // 排除链路本地地址
                            promise.resolve(ipv6)
                            return
                        }
                    }
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("NETWORK_ERROR", "Failed to get IPv6 address: ${e.message}", e)
        }
    }

    /**
     * 获取 WiFi MAC 地址
     * 注意：Android 6.0+ 系统会返回固定值 02:00:00:00:00:00
     */
    @ReactMethod
    fun getMacAddress(promise: Promise) {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val networkInterface = interfaces.nextElement()
                if (networkInterface.name.equals("wlan0", ignoreCase = true)) {
                    val mac = networkInterface.hardwareAddress
                    if (mac != null) {
                        val macAddress = mac.joinToString(":") { String.format("%02x", it) }
                        promise.resolve(macAddress)
                        return
                    }
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("NETWORK_ERROR", "Failed to get MAC address: ${e.message}", e)
        }
    }

    /**
     * 检查 WiFi 是否已启用
     */
    @ReactMethod
    fun isWifiEnabled(promise: Promise) {
        try {
            promise.resolve(wifiManager.isWifiEnabled)
        } catch (e: Exception) {
            promise.reject("WIFI_ERROR", "Failed to check WiFi status: ${e.message}", e)
        }
    }

    /**
     * 检查是否已连接到 WiFi
     */
    @ReactMethod
    fun isConnected(promise: Promise) {
        try {
            val network = connectivityManager.activeNetwork
            val capabilities = connectivityManager.getNetworkCapabilities(network)
            val isWifiConnected = capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
            promise.resolve(isWifiConnected)
        } catch (e: Exception) {
            promise.reject("NETWORK_ERROR", "Failed to check connection status: ${e.message}", e)
        }
    }

    /**
     * 获取完整的网络信息（包含扩展 WiFi 详细信息）
     */
    @ReactMethod
    fun getNetworkInfo(promise: Promise) {
        try {
            val result = Arguments.createMap()

            // WiFi 状态
            result.putBoolean("wifiEnabled", wifiManager.isWifiEnabled)

            // 连接状态
            val network = connectivityManager.activeNetwork
            val capabilities = connectivityManager.getNetworkCapabilities(network)
            val isWifiConnected = capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
            result.putBoolean("connected", isWifiConnected)

            // 获取 WifiInfo 对象（包含详细信息）
            @Suppress("DEPRECATION")
            val wifiInfo = wifiManager.connectionInfo

            // SSID
            if (hasLocationPermission() && isWifiConnected && wifiInfo != null) {
                val ssid = wifiInfo.ssid
                if (ssid != null && ssid != "<unknown ssid>" && ssid != "0x") {
                    result.putString("ssid", ssid.replace("\"", ""))
                } else {
                    result.putNull("ssid")
                }

                // 信号强度 (RSSI to percentage: -100 to -40 dBm -> 0-100%)
                val rssi = wifiInfo.rssi
                val signalStrength = when {
                    rssi >= -40 -> 100
                    rssi <= -100 -> 0
                    else -> ((rssi + 100) * 100 / 60).coerceIn(0, 100)
                }
                result.putInt("signalStrength", signalStrength)
                result.putInt("rssi", rssi)

                // 连接速度 (Mbps)
                val linkSpeed = wifiInfo.linkSpeed
                result.putInt("linkSpeed", linkSpeed)

                // BSSID (路由器 MAC 地址)
                val bssid = wifiInfo.bssid
                if (bssid != null && bssid != "00:00:00:00:00:00") {
                    result.putString("bssid", bssid)
                } else {
                    result.putNull("bssid")
                }

                // 频段 (通过信道判断，API 23+ 可获取 frequency)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    @Suppress("DEPRECATION")
                    val frequency = wifiInfo.frequency
                    result.putInt("frequency", frequency)

                    // 根据频率判断信道
                    val channel = when {
                        frequency in 2412..2484 -> (frequency - 2412) / 5 + 1
                        frequency == 2484 -> 14
                        frequency in 5170..5825 -> (frequency - 5170) / 5 + 34
                        else -> 0
                    }
                    result.putInt("channel", channel)
                } else {
                    result.putNull("frequency")
                    result.putNull("channel")
                }

                // Network ID (配置的网络 ID)
                val networkId = wifiInfo.networkId
                result.putInt("networkId", networkId)

                // 尝试获取安全类型（需要扫描配置的网络列表）
                try {
                    @Suppress("DEPRECATION")
                    val configuredNetworks = wifiManager.configuredNetworks
                    val currentConfig = configuredNetworks?.find { it.networkId == networkId }
                    if (currentConfig != null) {
                        val allowedKeyManagement = currentConfig.allowedKeyManagement
                        val security = when {
                            allowedKeyManagement.get(android.net.wifi.WifiConfiguration.KeyMgmt.WPA_PSK) -> "WPA-PSK"
                            allowedKeyManagement.get(android.net.wifi.WifiConfiguration.KeyMgmt.WPA_EAP) -> "WPA-EAP"
                            allowedKeyManagement.get(android.net.wifi.WifiConfiguration.KeyMgmt.IEEE8021X) -> "IEEE8021X"
                            allowedKeyManagement.get(android.net.wifi.WifiConfiguration.KeyMgmt.NONE) -> {
                                if (currentConfig.wepKeys[0] != null) "WEP" else "Open"
                            }
                            else -> "Unknown"
                        }
                        result.putString("security", security)
                    } else {
                        result.putNull("security")
                    }
                } catch (e: Exception) {
                    // Android 10+ 不允许访问 configuredNetworks
                    result.putNull("security")
                }
            } else {
                result.putNull("ssid")
                result.putNull("signalStrength")
                result.putNull("rssi")
                result.putNull("linkSpeed")
                result.putNull("bssid")
                result.putNull("frequency")
                result.putNull("channel")
                result.putNull("networkId")
                result.putNull("security")
            }

            // IPv4/IPv6/MAC 地址
            var ipv4: String? = null
            var ipv6: String? = null
            var mac: String? = null

            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val networkInterface = interfaces.nextElement()

                // MAC 地址
                if (networkInterface.name.equals("wlan0", ignoreCase = true)) {
                    val macBytes = networkInterface.hardwareAddress
                    if (macBytes != null) {
                        mac = macBytes.joinToString(":") { String.format("%02x", it) }
                    }
                }

                val addresses = networkInterface.inetAddresses
                while (addresses.hasMoreElements()) {
                    val address = addresses.nextElement()
                    if (!address.isLoopbackAddress) {
                        if (address is Inet4Address && ipv4 == null) {
                            ipv4 = address.hostAddress
                        } else if (address.hostAddress?.contains(":") == true && ipv6 == null) {
                            val ip = address.hostAddress?.split("%")?.get(0)
                            if (ip != null && !ip.startsWith("fe80")) {
                                ipv6 = ip
                            }
                        }
                    }
                }
            }

            if (ipv4 != null) result.putString("ipv4", ipv4) else result.putNull("ipv4")
            if (ipv6 != null) result.putString("ipv6", ipv6) else result.putNull("ipv6")
            if (mac != null) result.putString("mac", mac) else result.putNull("mac")

            // 获取网关地址（需要使用 DhcpInfo）
            try {
                @Suppress("DEPRECATION")
                val dhcpInfo = wifiManager.dhcpInfo
                if (dhcpInfo != null) {
                    // 转换 IP 地址格式 (int to String)
                    val gateway = String.format(
                        "%d.%d.%d.%d",
                        dhcpInfo.gateway and 0xff,
                        dhcpInfo.gateway shr 8 and 0xff,
                        dhcpInfo.gateway shr 16 and 0xff,
                        dhcpInfo.gateway shr 24 and 0xff
                    )
                    if (gateway != "0.0.0.0") {
                        result.putString("gateway", gateway)
                    } else {
                        result.putNull("gateway")
                    }

                    // DNS 服务器
                    val dns1 = String.format(
                        "%d.%d.%d.%d",
                        dhcpInfo.dns1 and 0xff,
                        dhcpInfo.dns1 shr 8 and 0xff,
                        dhcpInfo.dns1 shr 16 and 0xff,
                        dhcpInfo.dns1 shr 24 and 0xff
                    )
                    val dns2 = String.format(
                        "%d.%d.%d.%d",
                        dhcpInfo.dns2 and 0xff,
                        dhcpInfo.dns2 shr 8 and 0xff,
                        dhcpInfo.dns2 shr 16 and 0xff,
                        dhcpInfo.dns2 shr 24 and 0xff
                    )

                    val dnsList = Arguments.createArray()
                    if (dns1 != "0.0.0.0") dnsList.pushString(dns1)
                    if (dns2 != "0.0.0.0") dnsList.pushString(dns2)
                    if (dnsList.size() > 0) {
                        result.putArray("dns", dnsList)
                    } else {
                        result.putNull("dns")
                    }

                    // 子网掩码
                    val netmask = String.format(
                        "%d.%d.%d.%d",
                        dhcpInfo.netmask and 0xff,
                        dhcpInfo.netmask shr 8 and 0xff,
                        dhcpInfo.netmask shr 16 and 0xff,
                        dhcpInfo.netmask shr 24 and 0xff
                    )
                    if (netmask != "0.0.0.0") {
                        result.putString("subnetMask", netmask)
                    } else {
                        result.putNull("subnetMask")
                    }
                } else {
                    result.putNull("gateway")
                    result.putNull("dns")
                    result.putNull("subnetMask")
                }
            } catch (e: Exception) {
                result.putNull("gateway")
                result.putNull("dns")
                result.putNull("subnetMask")
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("NETWORK_ERROR", "Failed to get network info: ${e.message}", e)
        }
    }

    /**
     * 检查是否有位置权限
     */
    @ReactMethod
    fun checkLocationPermission(promise: Promise) {
        promise.resolve(hasLocationPermission())
    }
}
