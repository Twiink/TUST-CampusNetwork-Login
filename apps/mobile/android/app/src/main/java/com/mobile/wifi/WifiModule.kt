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
     * 获取完整的网络信息
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

            // SSID
            if (hasLocationPermission() && isWifiConnected) {
                @Suppress("DEPRECATION")
                val wifiInfo = wifiManager.connectionInfo
                val ssid = wifiInfo?.ssid
                if (ssid != null && ssid != "<unknown ssid>" && ssid != "0x") {
                    result.putString("ssid", ssid.replace("\"", ""))
                } else {
                    result.putNull("ssid")
                }
            } else {
                result.putNull("ssid")
            }

            // IPv4 地址
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
