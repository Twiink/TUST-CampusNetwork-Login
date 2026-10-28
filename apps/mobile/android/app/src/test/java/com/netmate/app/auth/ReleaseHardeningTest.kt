package com.netmate.app.auth

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ReleaseHardeningTest {
    private val account = AutoAuthAccount("a", "fixture", "fixture-password", "campus", "http://portal.test")
    @Test fun nativeProfileKeepsIntervalIdentityAndLegacyDefaults() {
        val legacy = AutoAuthProfile.fromJson("""{"enabled":true,"wifiRules":[{"ssid":"Campus"}]}""")
        assertEquals(30, legacy.heartbeatIntervalSeconds)
        assertEquals("Campus", legacy.wifiRules.single().id)
        val profile = AutoAuthProfile.fromJson("""{"enabled":true,"heartbeatIntervalSeconds":300,"wifiRules":[{"id":"pinned","ssid":"Campus","security":"WPA3","bssid":"aa:bb:cc:dd:ee:ff"}]}""")
        assertEquals(300, profile.heartbeatIntervalSeconds)
        assertEquals("pinned", profile.wifiRules.single().id)
        assertEquals("WPA3", profile.wifiRules.single().security)
        assertEquals(15, AutoAuthProfile.fromJson("""{"heartbeatIntervalSeconds":5}""").heartbeatIntervalSeconds)
    }
    @Test fun exactFingerprintWinsPriorityAndMismatchCannotAuthenticate() {
        val generic = AutoAuthWifiRule("Campus", false, emptyList(), priority = 1)
        val secure = generic.copy(id = "secure", requiresAuth = true, security = "WPA2-Personal", linkedAccountIds = listOf("a"), priority = 2)
        val pinned = secure.copy(id = "pinned", requiresAuth = false, bssid = "AA:BB:CC:DD:EE:FF", priority = 3)
        val profile = AutoAuthProfile(true, "a", listOf(account), listOf(generic, secure, pinned))
        assertFalse(AutoAuthPolicy.decide(profile, "Campus", "10.1.2.3", true, "WPA2", "aa:bb:cc:dd:ee:ff").requiresAuth)
        assertTrue(AutoAuthPolicy.decide(profile, "Campus", "10.1.2.3", true, "WPA2", "aa:bb:cc:dd:ee:01").requiresAuth)
        assertFalse(AutoAuthPolicy.decide(profile.copy(wifiRules = listOf(pinned)), "Campus", "10.1.2.3", true, "Open").requiresAuth)
    }
    @Test fun securityModesAndSameNameReconnectCandidatesRemainDistinct() {
        assertEquals("wpa2-wpa3", WifiSecurity.normalize("[WPA2-PSK][RSN-SAE]"))
        assertEquals("enterprise", WifiSecurity.normalize("WPA2-EAP"))
        val first = WifiReconnectPolicy.Candidate("Campus", "fixture", 1, "one")
        val second = first.copy(id = "two", priority = 2)
        assertEquals(2, WifiReconnectPolicy.plan("Campus", listOf(first, second)).size)
    }
}
