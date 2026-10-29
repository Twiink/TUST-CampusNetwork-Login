package com.netmate.app.auth

import android.content.Context
import android.content.SharedPreferences
import android.net.Network
import android.os.Handler
import android.os.Looper
import android.net.wifi.WifiConfiguration
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.mockito.Mockito.*
import java.nio.file.Files
import java.util.concurrent.TimeUnit

class FunctionalCompletionTest {
    private val account = AutoAuthAccount("b", "fixture", "fixture-only", "campus", "http://portal-b.test")
    private fun profile() = AutoAuthProfile(true, "b", listOf(account), listOf(
        AutoAuthWifiRule("CampusA", true, listOf("b"), autoConnect = true, priority = 9, security = "Open"),
        AutoAuthWifiRule("BackupB", false, emptyList(), autoConnect = true, priority = 1, security = "Open")),
        wifiRetries = 1, heartbeatIntervalSeconds = 0, failureThreshold = 2, notifications = NotificationFlags(false, false, false, false))
    private fun fixture(profile: AutoAuthProfile, body: (Context, MutableMap<String, String>, MutableList<String>, MutableList<String>, (Boolean) -> Unit) -> Unit) {
        val context = mock(Context::class.java)
        val preferences = mock(SharedPreferences::class.java)
        val editor = mock(SharedPreferences.Editor::class.java, RETURNS_SELF)
        val values = mutableMapOf<String, String>()
        `when`(context.applicationContext).thenReturn(context)
        `when`(context.filesDir).thenReturn(Files.createTempDirectory("netmate-functional").toFile())
        `when`(context.getSharedPreferences("netmate_native_v1", 0)).thenReturn(preferences)
        `when`(preferences.edit()).thenReturn(editor)
        `when`(preferences.getString(anyString(), isNull())).thenAnswer { values[it.getArgument(0)] }
        `when`(editor.putString(anyString(), any())).thenAnswer { call -> val key = call.getArgument<String>(0); val value = call.getArgument<String?>(1); if (value == null) values.remove(key) else values[key] = value; editor }
        `when`(editor.remove(anyString())).thenAnswer { values.remove(it.getArgument<String>(0)); editor }
        `when`(editor.commit()).thenReturn(true)
        val cached = AutoAuthStore::class.java.getDeclaredField("cachedProfile").apply { isAccessible = true }
        val previous = cached.get(null)
        val priorSnapshot = WifiEnvironment.snapshotPort
        val priorConnect = WifiEnvironment.connectPort
        val priorClient = AutoAuthEngine.portalClient
        val connections = mutableListOf<String>()
        val requests = mutableListOf<String>()
        var current = "CampusA"
        var connected = true
        val networkKey = System.nanoTime().toString()
        var hardwareMock: org.mockito.MockedConstruction<WifiConfiguration>? = null
        try {
            AutoAuthEngine.runConnection { hardwareMock = mockConstruction(WifiConfiguration::class.java) { wifi, _ -> wifi.allowedKeyManagement = java.util.BitSet() } }
            cached.set(null, profile)
            WifiEnvironment.snapshotPort = { WifiEnvironment.Snapshot(true, connected, if (connected) current else null, if (connected) "10.1.2.3" else null, key = "$networkKey:$current:$connected", security = "Open", validated = current == "BackupB") }
            WifiEnvironment.connectPort = { _, ssid, _ -> connections.add(ssid); current = ssid; connected = true; true }
            AutoAuthEngine.portalClient = PortalClient(object : PortalClient.Transport {
                override fun get(url: String, network: Network?, timeoutMs: Int, readBody: Boolean): Pair<Int, String> {
                    requests.add(url)
                    return if (url.contains("/login?")) 200 to "{\"status\":1}" else if (url.contains("/logout")) 200 to "{\"result\":1}" else 200 to ""
                }
            }, sleeper = {})
            mockStatic(Looper::class.java).use { looper ->
                looper.`when`<Looper> { Looper.getMainLooper() }.thenReturn(mock(Looper::class.java))
                mockConstruction(Handler::class.java).use { WifiSuggestions.expire(context, onlyDisconnected = true) }
            }
            AutoAuthEngine.resetBackoff()
            body(context, values, connections, requests) { connected = it }
        } finally {
            AutoAuthEngine.stopReconnect(context)
            AutoAuthEngine.runConnection { hardwareMock?.close() }
            AutoAuthEngine.checkAsync(context, "status").get(10, TimeUnit.SECONDS)
            cached.set(null, previous)
            WifiEnvironment.snapshotPort = priorSnapshot
            WifiEnvironment.connectPort = priorConnect
            AutoAuthEngine.portalClient = priorClient
        }
    }
    @Test fun portalSuccessWithoutInternetFallsBackWithoutRepeatedAuthentication() = fixture(profile()) { context, _, connections, requests, _ ->
        val observations = mutableListOf<JSONObject>()
        val listener: (JSONObject) -> Unit = { observations.add(JSONObject(AutoAuthEngine.snapshot(context).toString())) }
        ReconnectEvents.listeners.add(listener)
        try { AutoAuthEngine.checkAsync(context, AutoAuthEngine.TRIGGER_NETWORK).get(10, TimeUnit.SECONDS) }
        finally { ReconnectEvents.listeners.remove(listener) }
        assertEquals(ReconnectEvents.latest.toString() + " requestCount=" + requests.size + " result=" + AutoAuthStore.loadLastResult(context), listOf("BackupB"), connections)
        assertEquals(1, requests.count { it.contains("/login?") })
        assertTrue(observations.any { it.optBoolean("authenticated") && !it.optBoolean("internetReachable") })
        assertTrue(AutoAuthEngine.snapshot(context).getBoolean("internetReachable"))
    }
    @Test fun hotspotInternetLossAlsoUsesBackupWithoutPortalRequests() = fixture(profile().copy(wifiRules = profile().wifiRules.map { it.copy(requiresAuth = false) })) { context, _, connections, requests, _ ->
        AutoAuthEngine.checkAsync(context, AutoAuthEngine.TRIGGER_NETWORK).get(10, TimeUnit.SECONDS)
        assertEquals(ReconnectEvents.latest.toString() + " requestCount=" + requests.size + " result=" + AutoAuthStore.loadLastResult(context), listOf("BackupB"), connections)
        assertFalse(requests.any { it.contains("/login?") })
    }
    @Test fun startupAndRuntimeSwitchesAreIndependentInAllFourCombinations() {
        for (startup in listOf(false, true)) for (runtime in listOf(false, true)) {
            fixture(profile().copy(enabled = runtime, startupAutoConnect = startup, keepCurrentConnection = false)) { context, _, connections, _, setConnected ->
                setConnected(false)
                AutoAuthEngine.onStartup(context)
                AutoAuthEngine.checkAsync(context, "status").get(10, TimeUnit.SECONDS)
                assertEquals(ReconnectEvents.latest.toString() + " startup=" + startup + " runtime=" + runtime, if (startup) listOf("BackupB") else emptyList<String>(), connections)
                setConnected(true)
                AutoAuthEngine.checkAsync(context, "status").get(10, TimeUnit.SECONDS)
                val previousSsid = WifiEnvironment.snapshot(context).ssid
                connections.clear()
                setConnected(false)
                AutoAuthEngine.onWifiLost(context, previousSsid)
                AutoAuthEngine.checkAsync(context, "status").get(10, TimeUnit.SECONDS)
                assertEquals("runtime=" + runtime + " startup=" + startup, if (!runtime) emptyList<String>() else if (startup) listOf("BackupB") else listOf("CampusA", "BackupB"), connections)
            }
        }
    }
    @Test fun keepCurrentOnlyControlsStartupAndDoesNotPreventRuntimeFailover() = fixture(profile().copy(startupAutoConnect = true, keepCurrentConnection = true, authPaused = true)) { context, _, connections, requests, _ ->
        AutoAuthEngine.onStartup(context)
        AutoAuthEngine.checkAsync(context, "status").get(10, TimeUnit.SECONDS)
        assertTrue(connections.isEmpty())
        assertFalse(requests.any { it.contains("/login?") })
    }
    @Test fun staleLegacyPortalDoesNotOverrideTheCurrentAccount() = fixture(profile().copy(authPaused = true)) { context, values, _, requests, _ ->
        values["session_server"] = "http://previous.test"
        val result = AutoAuthEngine.logoutAsync(context).get(10, TimeUnit.SECONDS)
        assertTrue(result.success)
        assertEquals(listOf("http://portal-b.test/eportal/portal/logout"), requests)
    }
    @Test fun staleBoundSessionUsesCurrentPortalAndAmbiguousPortalsRequireLogin() {
        fixture(profile().copy(authPaused = true)) { context, values, _, requests, _ ->
            values["auth_session"] = JSONObject().put("server", "http://previous.test").put("network", "previous-network").toString()
            assertTrue(AutoAuthEngine.logoutAsync(context).get(10, TimeUnit.SECONDS).success)
            assertEquals(listOf("http://portal-b.test/eportal/portal/logout"), requests)
        }
        val second = account.copy(id = "a", serverUrl = "http://portal-a.test")
        fixture(profile().copy(authPaused = true, accounts = listOf(account, second), wifiRules = profile().wifiRules.map { it.copy(linkedAccountIds = listOf("b", "a")) })) { context, _, _, requests, _ ->
            assertFalse(AutoAuthEngine.logoutAsync(context).get(10, TimeUnit.SECONDS).success)
            assertTrue(requests.isEmpty())
        }
    }
    @Test fun associatedNonAutomaticHotspotCanBeVerifiedBeforeFallingBack() = fixture(profile().copy(wifiRules = profile().wifiRules.map { if (it.ssid == "CampusA") it.copy(autoConnect = false, requiresAuth = false) else it })) { context, _, connections, requests, _ ->
        AutoAuthEngine.checkAsync(context, AutoAuthEngine.TRIGGER_NETWORK).get(10, TimeUnit.SECONDS)
        assertEquals(listOf("BackupB"), connections)
        assertFalse(requests.any { it.contains("/login?") })
    }
    @Test fun allCandidatesFailIntoTheConfiguredMinimumRoundDelay() = fixture(profile().copy(wifiCooldownMinutes = 0)) { context, _, connections, requests, _ ->
        val snapshot = WifiEnvironment.snapshotPort!!
        WifiEnvironment.snapshotPort = { snapshot(it).copy(validated = false) }
        AutoAuthEngine.checkAsync(context, AutoAuthEngine.TRIGGER_NETWORK).get(10, TimeUnit.SECONDS)
        assertEquals(listOf("BackupB"), connections)
        assertEquals(1, requests.count { it.contains("/login?") })
        assertEquals("cooldown", ReconnectEvents.latest.getString("status"))
        assertEquals(2, ReconnectEvents.latest.getJSONArray("failedList").length())
        assertTrue(ReconnectEvents.latest.getLong("nextRetryAt") >= System.currentTimeMillis() + 4000)
        AutoAuthEngine.checkAsync(context, "interval").get(10, TimeUnit.SECONDS)
        assertEquals(listOf("BackupB"), connections)
    }
    @Test fun lossOfANonAutomaticNetworkStillAllowsAutomaticBackup() = fixture(profile().copy(wifiRules = profile().wifiRules.map { if (it.ssid == "CampusA") it.copy(autoConnect = false) else it })) { context, _, connections, _, setConnected ->
        AutoAuthEngine.checkAsync(context, "status").get(10, TimeUnit.SECONDS)
        setConnected(false)
        AutoAuthEngine.onWifiLost(context, "CampusA")
        AutoAuthEngine.checkAsync(context, "status").get(10, TimeUnit.SECONDS)
        assertEquals(listOf("BackupB"), connections)
        assertEquals("success", ReconnectEvents.latest.getString("status"))
    }
    @Test fun manualSelectionInvalidatesAnInFlightRecoveryBeforeItsResponseCanBeApplied() = fixture(profile()) { context, _, connections, _, _ ->
        val started = java.util.concurrent.CountDownLatch(1)
        val release = java.util.concurrent.CountDownLatch(1)
        AutoAuthEngine.portalClient = PortalClient(object : PortalClient.Transport {
            override fun get(url: String, network: Network?, timeoutMs: Int, readBody: Boolean): Pair<Int, String> {
                if (!url.contains("/login?")) return 200 to ""
                started.countDown(); check(release.await(5, TimeUnit.SECONDS)); return 200 to "{\"status\":1}"
            }
        }, sleeper = {})
        val recovery = AutoAuthEngine.checkAsync(context, AutoAuthEngine.TRIGGER_NETWORK)
        try {
            assertTrue(started.await(5, TimeUnit.SECONDS))
            AutoAuthEngine.beginManualConnection(context)
            AutoAuthEngine.runConnection { WifiEnvironment.connectPort!!.invoke(context, "BackupB", ""); AutoAuthEngine.endManualConnection(context) }
        } finally { release.countDown() }
        recovery.get(10, TimeUnit.SECONDS)
        AutoAuthEngine.checkAsync(context, "status").get(10, TimeUnit.SECONDS)
        assertEquals(listOf("BackupB"), connections)
        assertTrue(AutoAuthEngine.snapshot(context).getBoolean("internetReachable"))
    }
    @Test fun radioOffAndServiceStopTerminateInFlightRecoveryWithoutPublishingLateSuccess() {
        for (radioOff in listOf(true, false)) fixture(profile()) { context, _, connections, _, _ ->
            val started = java.util.concurrent.CountDownLatch(1)
            val release = java.util.concurrent.CountDownLatch(1)
            AutoAuthEngine.portalClient = PortalClient(object : PortalClient.Transport {
                override fun get(url: String, network: Network?, timeoutMs: Int, readBody: Boolean): Pair<Int, String> {
                    if (!url.contains("/login?")) return 200 to ""
                    started.countDown(); check(release.await(5, TimeUnit.SECONDS)); return 200 to "{\"status\":1}"
                }
            }, sleeper = {})
            val recovery = AutoAuthEngine.checkAsync(context, AutoAuthEngine.TRIGGER_NETWORK)
            try {
                assertTrue(started.await(5, TimeUnit.SECONDS))
                if (radioOff) {
                    val snapshot = WifiEnvironment.snapshotPort!!
                    WifiEnvironment.snapshotPort = { snapshot(it).copy(enabled = false, connected = false, ssid = null, ipv4 = null, key = "radio-off") }
                } else AutoAuthEngine.stopReconnect(context, "自动恢复服务已停止")
            } finally { release.countDown() }
            recovery.get(10, TimeUnit.SECONDS)
            assertEquals("cancelled", ReconnectEvents.latest.getString("status"))
            assertEquals(if (radioOff) "系统 WiFi 已关闭" else "自动恢复服务已停止", ReconnectEvents.latest.getString("reason"))
            assertFalse(AutoAuthEngine.snapshot(context).getBoolean("authenticated"))
            assertTrue(connections.isEmpty())
        }
    }
}
