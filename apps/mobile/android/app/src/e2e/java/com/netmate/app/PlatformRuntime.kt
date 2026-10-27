package com.netmate.app

import android.content.Context
import com.netmate.app.auth.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Only the e2e source set can install these controlled radio / portal boundaries. */
object PlatformRuntime {
    private const val BASE = "http://10.0.2.2:38081"
    val constants: Map<String, Any> = mapOf("updateFeedUrl" to "$BASE/releases/latest")
    @Volatile private var state = JSONObject().put("ssid", "TUST-WIFI").put("enabled", true).put("failConnections", false)
    private val clock = Executors.newSingleThreadScheduledExecutor()
    fun install(context: Context) {
        WifiEnvironment.snapshotPort = {
            val current = state
            val ssid = current.optString("ssid").takeIf { it.isNotBlank() }
            WifiEnvironment.Snapshot(enabled = current.optBoolean("enabled", true), connected = ssid != null, ssid = ssid,
                ipv4 = if (ssid != null) "10.1.2.3" else null, key = "fixture:${ssid ?: "none"}", signal = 80)
        }
        WifiEnvironment.scanPort = { listOf(Triple("TUST-WIFI", 80, "WPA2"), Triple("TUST-Backup", 60, "Open"), Triple("Nearby-WIFI", 40, "WPA2")) }
        WifiEnvironment.connectPort = { _, ssid, _ ->
            if (state.optBoolean("failConnections")) false else {
                state = JSONObject(state.toString()).put("ssid", ssid)
                request("/control?ssid=${java.net.URLEncoder.encode(ssid, "UTF-8")}")
                true
            }
        }
        AutoAuthEngine.portalClient = PortalClient(object : PortalClient.Transport {
            private val transport = UrlConnectionTransport()
            override fun get(url: String, network: android.net.Network?, timeoutMs: Int, readBody: Boolean): Pair<Int, String> {
                val target = URL(url)
                val path = if (target.path.contains("generate_204")) "/generate_204" else target.file
                return transport.get(BASE + path, null, timeoutMs, readBody)
            }
        })
        clock.scheduleWithFixedDelay({
            try {
                val next = JSONObject(request("/radio"))
                val old = state.optString("ssid")
                state = next
                if (old.isNotBlank() && next.optString("ssid").isBlank()) AutoAuthEngine.onWifiLost(context, old)
                if (old != next.optString("ssid")) AutoAuthEngine.checkAsync(context, AutoAuthEngine.TRIGGER_NETWORK)
            } catch (_: Exception) { }
        }, 0, 500, TimeUnit.MILLISECONDS)
    }
    private fun request(path: String): String {
        val connection = URL(BASE + path).openConnection() as HttpURLConnection
        connection.connectTimeout = 1000; connection.readTimeout = 1000
        return try { connection.inputStream.bufferedReader().use { it.readText() } } finally { connection.disconnect() }
    }
}
