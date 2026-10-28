package com.netmate.app.wifi

import android.Manifest
import android.content.*
import android.content.pm.PackageManager
import android.net.*
import android.net.wifi.WifiManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.netmate.app.auth.*
import java.util.concurrent.Executors

class WifiModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "WifiModule"
    private val manager get() = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val wifi get() = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private var callback: ConnectivityManager.NetworkCallback? = null
    private var receiver: BroadcastReceiver? = null
    private var watchers = 0
    private var lastSsid: String? = null
    private val connections = Executors.newSingleThreadExecutor()
    private val scans = Executors.newSingleThreadExecutor()
    private fun state() = WifiEnvironment.snapshot(context)
    private fun changed() {
        if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("netmate:wifiChanged", "network")
        state().ssid?.let { lastSsid = it }
    }
    @ReactMethod fun startWatching(promise: Promise) {
        try {
            synchronized(this) {
                watchers++
                if (callback == null) {
                    val listener = object : ConnectivityManager.NetworkCallback() {
                        override fun onAvailable(network: Network) { changed(); AutoAuthEngine.checkAsync(context, AutoAuthEngine.TRIGGER_NETWORK) }
                        override fun onLost(network: Network) { val lost = lastSsid; changed(); if (!state().connected) AutoAuthEngine.onWifiLost(context, lost) }
                        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) { changed() }
                        override fun onLinkPropertiesChanged(network: Network, properties: LinkProperties) { changed() }
                    }
                    manager.registerNetworkCallback(NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(), listener)
                    callback = listener
                    val listenerReceiver = object : BroadcastReceiver() { override fun onReceive(c: Context, intent: Intent) { changed(); if (!state().enabled) AutoAuthEngine.stopReconnect(context) } }
                    ContextCompat.registerReceiver(context, listenerReceiver, IntentFilter(WifiManager.WIFI_STATE_CHANGED_ACTION), ContextCompat.RECEIVER_NOT_EXPORTED)
                    receiver = listenerReceiver
                }
            }
            promise.resolve(true)
        } catch (_: Exception) { promise.reject("WIFI_WATCH", "无法监听 WiFi，请检查权限") }
    }
    @ReactMethod fun stopWatching(promise: Promise) {
        synchronized(this) { watchers = (watchers - 1).coerceAtLeast(0); if (watchers == 0) release() }
        promise.resolve(true)
    }
    private fun release() {
        callback?.let { try { manager.unregisterNetworkCallback(it) } catch (_: Exception) {} }; callback = null
        receiver?.let { try { context.unregisterReceiver(it) } catch (_: Exception) {} }; receiver = null
    }
    override fun invalidate() { release(); connections.shutdownNow(); scans.shutdownNow(); super.invalidate() }
    @ReactMethod fun addListener(name: String) = Unit
    @ReactMethod fun removeListeners(count: Double) = Unit
    private fun permission() = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    @ReactMethod fun checkLocationPermission(promise: Promise) { promise.resolve(permission()) }
    @ReactMethod fun getCurrentSSID(promise: Promise) { promise.resolve(state().ssid) }
    @ReactMethod fun getIPAddress(promise: Promise) { promise.resolve(state().ipv4) }
    @ReactMethod fun getIPv6Address(promise: Promise) { promise.resolve(state().ipv6) }
    @ReactMethod fun getMacAddress(promise: Promise) { promise.resolve(null) }
    @ReactMethod fun isWifiEnabled(promise: Promise) { promise.resolve(state().enabled) }
    @ReactMethod fun isConnected(promise: Promise) { promise.resolve(state().connected) }
    @ReactMethod fun getNetworkInfo(promise: Promise) {
        try {
            val value = state()
            val result = Arguments.createMap()
            result.putBoolean("wifiEnabled", value.enabled); result.putBoolean("connected", value.connected)
            result.putString("ssid", value.ssid); result.putString("ipv4", value.ipv4); result.putString("ipv6", value.ipv6)
            result.putString("networkKey", value.key); result.putString("mac", null); result.putString("bssid", value.bssid)
            result.putString("security", value.security)
            result.putString("gateway", value.gateway); result.putString("subnetMask", null)
            value.signal?.let { result.putInt("signalStrength", it) }
            value.frequency?.let { result.putInt("frequency", it); result.putInt("channel", channel(it)) }
            value.linkSpeed?.let { result.putInt("linkSpeed", it) }
            val dns = Arguments.createArray(); value.dns.forEach { dns.pushString(it) }; result.putArray("dns", dns)
            result.putBoolean("validated", value.validated)
            promise.resolve(result)
        } catch (_: Exception) { promise.reject("WIFI_INFO", "读取 WiFi 信息失败，请检查权限") }
    }
    @ReactMethod fun connectToWifi(ssid: String, password: String?, security: String?, bssid: String?, ruleId: String?, promise: Promise) {
        connections.execute {
            try {
                if (!WifiConnector.connect(context, ssid, password, security, bssid, manual = true, ruleId = ruleId ?: ssid)) { promise.resolve(false); return@execute }
                ReconnectEvents.publish(org.json.JSONObject().put("status", "awaiting-system").put("ssid", ssid))
                WifiConnector.openSelection(context, ssid, password, security, bssid)
                for (attempt in 0 until 60) {
                    val value = state()
                    if (value.connected && value.ssid == ssid && (bssid.isNullOrBlank() || WifiSecurity.bssid(value.bssid) == WifiSecurity.bssid(bssid)) && value.ipv4 != null) {
                        ReconnectEvents.publish(org.json.JSONObject().put("status", "success").put("ssid", ssid))
                        changed(); promise.resolve(true); return@execute
                    }
                    Thread.sleep(500)
                }
                ReconnectEvents.publish(org.json.JSONObject().put("status", "failed").put("ssid", ssid).put("message", "未连接目标 WiFi，请在系统 WiFi 设置中确认授权"))
                promise.resolve(false)
            } catch (e: IllegalArgumentException) { promise.reject("WIFI_SECURITY", e.message ?: "请通过系统设置连接此网络") }
            catch (_: Exception) { promise.reject("WIFI_CONNECT", "连接失败，请检查密码或系统授权") }
        }
    }
    @ReactMethod fun openWifiSettings(promise: Promise) {
        context.startActivity(Intent(if (Build.VERSION.SDK_INT >= 29) android.provider.Settings.Panel.ACTION_WIFI else android.provider.Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        promise.resolve(true)
    }
    @ReactMethod fun disconnectWifi(promise: Promise) {
        @Suppress("DEPRECATION")
        try { WifiSuggestions.expire(context); promise.resolve(wifi.disconnect()) }
        catch (_: Exception) { promise.reject("WIFI_DISCONNECT", "临时网络建议撤销失败，请重试") }
    }
    @ReactMethod fun scanWifiNetworks(promise: Promise) {
        scans.execute {
            try {
                val output = Arguments.createArray()
                val fixture = WifiEnvironment.scanPort?.invoke()
                if (fixture != null) fixture.forEach { (ssid, strength, security) ->
                    val item = Arguments.createMap(); item.putString("ssid", ssid); item.putInt("signalStrength", strength); item.putString("security", security); output.pushMap(item)
                } else {
                    if (!permission()) { promise.reject("WIFI_PERMISSION", "扫描需要定位权限，请在权限设置中授权"); return@execute }
                    val completed = java.util.concurrent.CountDownLatch(1)
                    val updated = java.util.concurrent.atomic.AtomicBoolean(false)
                    val scanReceiver = object : BroadcastReceiver() {
                        override fun onReceive(c: Context, intent: Intent) {
                            if (intent.action == WifiManager.SCAN_RESULTS_AVAILABLE_ACTION) {
                                updated.set(intent.getBooleanExtra(WifiManager.EXTRA_RESULTS_UPDATED, false))
                                completed.countDown()
                            }
                        }
                    }
                    ContextCompat.registerReceiver(context, scanReceiver, IntentFilter(WifiManager.SCAN_RESULTS_AVAILABLE_ACTION), ContextCompat.RECEIVER_NOT_EXPORTED)
                    try {
                        @Suppress("DEPRECATION")
                        val accepted = wifi.startScan()
                        if (!accepted) { promise.reject("WIFI_SCAN_THROTTLED", "系统暂时限制扫描，请稍后重试并确认定位服务已开启"); return@execute }
                        if (!completed.await(15, java.util.concurrent.TimeUnit.SECONDS)) { promise.reject("WIFI_SCAN_TIMEOUT", "扫描超时，请稍后刷新"); return@execute }
                        if (!updated.get()) { promise.reject("WIFI_SCAN_STALE", "系统未能更新附近网络，请稍后重试"); return@execute }
                        wifi.scanResults.filter { it.SSID.isNotBlank() }.distinctBy { Triple(it.SSID, it.capabilities, it.BSSID) }.sortedByDescending { it.level }.forEach { scan ->
                            val item = Arguments.createMap(); item.putString("ssid", scan.SSID); item.putString("bssid", scan.BSSID)
                            item.putInt("signalStrength", ((scan.level + 100) * 100 / 60).coerceIn(0, 100)); item.putInt("frequency", scan.frequency); item.putInt("channel", channel(scan.frequency))
                            item.putString("security", when { scan.capabilities.contains("EAP") -> "Enterprise"; scan.capabilities.contains("SAE") -> if (scan.capabilities.contains("PSK")) "WPA2-WPA3" else "WPA3"; scan.capabilities.contains("WPA2") -> "WPA2"; scan.capabilities.contains("WPA") -> "WPA"; scan.capabilities.contains("WEP") -> "WEP"; else -> "Open" }); output.pushMap(item)
                        }
                    } finally { context.unregisterReceiver(scanReceiver) }
                }
                promise.resolve(output)
            } catch (_: InterruptedException) { promise.reject("WIFI_SCAN_CANCELLED", "扫描已取消") }
            catch (_: Exception) { promise.reject("WIFI_SCAN", "扫描失败，请检查定位服务和附近设备权限") }
        }
    }
    private fun channel(frequency: Int) = when { frequency == 2484 -> 14; frequency in 2412..2472 -> (frequency - 2407) / 5; frequency in 5000..5900 -> (frequency - 5000) / 5; else -> 0 }
}
