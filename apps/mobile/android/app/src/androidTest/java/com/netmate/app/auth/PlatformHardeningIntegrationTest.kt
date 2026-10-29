package com.netmate.app.auth

import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSuggestion
import android.os.Build
import android.security.NetworkSecurityPolicy
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PlatformHardeningIntegrationTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val events = mutableListOf<String>()
    private val oldAdd = WifiSuggestions.addPort
    private val oldRemove = WifiSuggestions.removePort
    private val oldQuery = WifiSuggestions.queryPort
    private val applied = mutableListOf<WifiNetworkSuggestion>()
    private val rule = AutoAuthWifiRule("NetMateFixture", true, listOf("account"), "fixture-password", true, id = "fixture", security = "WPA2", bssid = "aa:bb:cc:dd:ee:01")
    @Before fun prepare() {
        WifiSuggestions.addPort = { entries -> events.add("add"); applied.addAll(entries); WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS }
        WifiSuggestions.removePort = { entries -> events.add("remove"); if (entries.isEmpty()) applied.clear() else applied.removeAll(entries.toSet()); WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS }
        WifiSuggestions.queryPort = { applied.toList() }
        WifiSuggestions.reconcile(context, AutoAuthProfile(false, null, emptyList(), emptyList()), true)
        events.clear()
    }
    @After fun restore() {
        WifiSuggestions.reconcile(context, AutoAuthProfile(false, null, emptyList(), emptyList()), true)
        WifiSuggestions.addPort = oldAdd; WifiSuggestions.removePort = oldRemove; WifiSuggestions.queryPort = oldQuery
    }
    @Test fun suggestionPasswordReplacementDisableAndDeletionReachSystemBoundary() {
        val profile = AutoAuthProfile(true, null, emptyList(), listOf(rule))
        if (Build.VERSION.SDK_INT < 29) {
            assertTrue(WifiConnector.connect(context, rule.ssid, rule.password, rule.security, rule.bssid))
            assertTrue(events.isEmpty()); return
        }
        WifiSuggestions.reconcile(context, profile)
        assertEquals(listOf("add"), events)
        WifiSuggestions.reconcile(context, profile)
        assertEquals(listOf("add"), events)
        WifiSuggestions.reconcile(context, profile.copy(wifiRules = listOf(rule.copy(password = "replacement-password"))), true)
        assertTrue(events.count { it == "add" } == 2)
        if (Build.VERSION.SDK_INT == 29) assertTrue(events.contains("remove"))
        WifiSuggestions.reconcile(context, profile.copy(wifiRules = listOf(rule.copy(password = ""))), true)
        assertTrue(applied.isEmpty())
        WifiSuggestions.reconcile(context, profile)
        WifiSuggestions.reconcile(context, profile.copy(enabled = false), true)
        assertEquals("remove", events.last()); assertTrue(applied.isEmpty())
        WifiSuggestions.reconcile(context, profile)
        WifiSuggestions.reconcile(context, profile.copy(wifiRules = emptyList()), true)
        assertTrue(applied.isEmpty())
    }
    @Test fun manualRequestDoesNotTurnIntoAutomaticSuggestionAndFailuresAreVisible() {
        if (Build.VERSION.SDK_INT < 29) {
            try { WifiConnector.connect(context, rule.ssid, rule.password, "WPA3"); fail("unsupported WPA3 accepted") } catch (_: IllegalArgumentException) { }
            return
        }
        val profile = AutoAuthProfile(false, null, emptyList(), listOf(rule.copy(autoConnect = false)))
        val revision = (AutoAuthStore.loadProfile(context)?.revision ?: 0) + 1
        AutoAuthStore.saveProfile(context, JSONObject().put("enabled", false).put("revision", revision).toString())
        WifiSuggestions.reconcile(context, profile, true)
        assertTrue(applied.isEmpty())
        WifiSuggestions.request(context, rule.copy(autoConnect = false))
        assertEquals(1, applied.size)
        WifiSuggestions.expire(context)
        assertTrue(applied.isEmpty())
        WifiSuggestions.addPort = { WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_APP_DISALLOWED }
        try { WifiSuggestions.reconcile(context, profile.copy(enabled = true, wifiRules = listOf(rule))); fail("system rejection hidden") } catch (_: IllegalStateException) { }
    }
    @Test fun securityBuilderAndProductionHttpPolicyAreUsed() {
        assertTrue(NetworkSecurityPolicy.getInstance().isCleartextTrafficPermitted("custom-campus.invalid"))
        val server=java.net.ServerSocket(0)
        val responder=kotlin.concurrent.thread(isDaemon=true) { server.accept().use { socket ->
            val reader=socket.getInputStream().bufferedReader();while(!reader.readLine().isNullOrEmpty()) { }
            val body="{\"ssid\":\"fixture\"}"
            socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: ${body.toByteArray().size}\r\nConnection: close\r\n\r\n$body".toByteArray())
        } }
        try {val response=UrlConnectionTransport().get("http://127.0.0.1:${server.localPort}/radio",null,5000,true);assertEquals(200,response.first);assertTrue(response.second.contains("ssid"))}finally{server.close();responder.join(1000)}
        if (Build.VERSION.SDK_INT >= 29) {
            assertNotNull(WifiConnector.suggestion(context, rule))
            assertNotNull(WifiConnector.suggestion(context, rule.copy(security = "Open", password = "")))
            assertNotNull(WifiConnector.suggestion(context, rule.copy(security = "WPA2-WPA3")))
            for (type in listOf("WEP", "Enterprise")) {
                try { WifiConnector.suggestion(context, rule.copy(security = type)); fail("unsupported mode accepted") } catch (_: IllegalArgumentException) { }
            }
            val manager = context.getSystemService(android.content.Context.WIFI_SERVICE) as WifiManager
            if (!manager.isWpa3SaeSupported) {
                try { WifiConnector.suggestion(context, rule.copy(security = "WPA3")); fail("unsupported WPA3 accepted") } catch (_: IllegalArgumentException) { }
            } else assertNotNull(WifiConnector.suggestion(context, rule.copy(security = "WPA3")))
        }
    }
    @Test fun persistedIntervalAndFingerprintSurviveProcessCacheReconstruction() {
        val revision = (AutoAuthStore.loadProfile(context)?.revision ?: 0) + 1
        AutoAuthStore.saveProfile(context, """{"enabled":false,"revision":$revision,"heartbeatIntervalSeconds":105,"wifiRules":[{"id":"stable","ssid":"Campus","security":"WPA3","bssid":"aa:bb:cc:dd:ee:01"}]}""")
        AutoAuthStore::class.java.getDeclaredField("cachedProfile").apply { isAccessible = true }.set(null, null)
        val restored = AutoAuthStore.loadProfile(context)!!
        assertEquals(105, restored.heartbeatIntervalSeconds)
        assertEquals("stable", restored.wifiRules.single().id)
        assertEquals("WPA3", restored.wifiRules.single().security)
    }
}
