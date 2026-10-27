package com.netmate.app.auth

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class NativeEngineIntegrationTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val requests = java.util.concurrent.CopyOnWriteArrayList<String>()
    private var ssid = "TUST-WIFI"
    private var oldPortal = AutoAuthEngine.portalClient
    private var oldSnapshot = WifiEnvironment.snapshotPort
    private var oldConnect = WifiEnvironment.connectPort
    private fun profile(paused: Boolean = false): String {
        val revision = (AutoAuthStore.loadProfile(context)?.revision ?: 0) + 1
        return """{"enabled":true,"revision":$revision,"authPaused":$paused,"currentAccountId":"one","accounts":[{"id":"one","username":"reject","password":"fake-one","isp":"campus","serverUrl":"http://one.test"},{"id":"two","username":"accept","password":"fake-two","isp":"cucc","serverUrl":"http://two.test"}],"wifiRules":[{"ssid":"TUST-WIFI","requiresAuth":true,"linkedAccountIds":["one","two"]}]}"""
    }
    @Before fun prepare() {
        oldPortal = AutoAuthEngine.portalClient; oldSnapshot = WifiEnvironment.snapshotPort; oldConnect = WifiEnvironment.connectPort
        WifiEnvironment.snapshotPort = { WifiEnvironment.Snapshot(true, true, ssid, "10.1.2.3", key = "integration:$ssid") }
        AutoAuthEngine.portalClient = PortalClient(object : PortalClient.Transport {
            override fun get(url: String, network: android.net.Network?, timeoutMs: Int, readBody: Boolean): Pair<Int, String> {
                requests.add(url.substringBefore('?'))
                if (url.contains("generate_204")) return 200 to "portal"
                if (url.contains("/logout")) return 200 to "{\"result\":1}"
                if (url.contains("reject")) throw java.io.IOException("synthetic timeout")
                return 200 to "{\"status\":1}"
            }
        }, sleeper = {})
        AutoAuthStore.saveProfile(context, profile())
        AutoAuthEngine.resetBackoff()
    }
    @After fun restore() { AutoAuthEngine.stopReconnect(context); AutoAuthEngine.portalClient = oldPortal; WifiEnvironment.snapshotPort = oldSnapshot; WifiEnvironment.connectPort = oldConnect; AutoAuthEngine.resetBackoff() }

    @Test fun duplicateLossKeepsOneScheduledRoundAndStopCancelsIt() {
        val attempts = java.util.concurrent.atomic.AtomicInteger()
        WifiEnvironment.snapshotPort = { WifiEnvironment.Snapshot(true, false, key = "integration:none") }
        WifiEnvironment.connectPort = { _, _, _ -> attempts.incrementAndGet(); false }
        val config = JSONObject(profile()).put("wifiRetries", 1).put("wifiCooldownMinutes", 0)
        config.getJSONArray("wifiRules").getJSONObject(0).put("autoConnect", true)
        AutoAuthStore.saveProfile(context, config.toString())
        val startedAt = System.currentTimeMillis()
        AutoAuthEngine.onWifiLost(context, "TUST-WIFI")
        AutoAuthEngine.onWifiLost(context, "TUST-WIFI")
        AutoAuthEngine.checkAsync(context, "status").get(10, TimeUnit.SECONDS)
        assertEquals(1, attempts.get())
        assertEquals("cooldown", ReconnectEvents.latest.getString("status"))
        assertTrue(ReconnectEvents.latest.getLong("nextRetryAt") >= startedAt + 5000)
        AutoAuthEngine.stopReconnect(context)
        assertEquals("idle", ReconnectEvents.latest.getString("status"))
        assertNull(AutoAuthStore.pendingSsid(context))
    }

    @Test fun nativeManualFallbackLogoutPauseAndLastServerShareOneEngine() {
        val result = AutoAuthEngine.checkAsync(context, AutoAuthEngine.TRIGGER_MANUAL).get(10, TimeUnit.SECONDS)!!
        assertTrue(result.success); assertEquals("accept", result.username)
        assertEquals("http://two.test", AutoAuthStore.sessionServer(context))
        AutoAuthEngine.checkAsync(context, "status").get(10, TimeUnit.SECONDS)
        assertTrue(AutoAuthEngine.snapshot(context).getBoolean("authenticated"))
        assertFalse(AutoAuthEngine.snapshot(context).getBoolean("internetReachable"))
        // Changing the selected account must not change the target of an existing session logout.
        AutoAuthStore.saveProfile(context, profile())
        assertTrue(AutoAuthEngine.logoutAsync(context).get(10, TimeUnit.SECONDS).success)
        assertTrue(AutoAuthStore.loadProfile(context)!!.authPaused)
        assertEquals("http://two.test/eportal/portal/logout", requests.last())
        requests.clear()
        AutoAuthEngine.checkAsync(context, AutoAuthEngine.TRIGGER_NETWORK).get(10, TimeUnit.SECONDS)
        assertTrue(requests.none { it.contains("/login") })
    }
    @Test fun staleProfileCannotOverwritePauseAndSnapshotDistinguishesAssociation() {
        val old = profile(); AutoAuthStore.saveProfile(context, old)
        AutoAuthEngine.logoutAsync(context).get(10, TimeUnit.SECONDS)
        try { AutoAuthStore.saveProfile(context, old); fail("stale revision accepted") } catch (_: IllegalArgumentException) { }
        val snapshot = AutoAuthEngine.snapshot(context)
        assertTrue(snapshot.getBoolean("wifiConnected")); assertTrue(snapshot.getBoolean("paused"))
        assertFalse(snapshot.getBoolean("authenticated")); assertFalse(snapshot.getBoolean("internetReachable"))
    }
}
