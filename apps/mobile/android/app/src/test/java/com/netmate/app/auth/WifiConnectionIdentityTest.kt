package com.netmate.app.auth

import android.content.Context
import org.junit.Assert.*
import org.junit.Test
import org.mockito.Mockito.mock

class WifiConnectionIdentityTest {
    @Test fun connectionWaitRejectsAnOpenNetworkForAWpa2RuleWithTheSameSsid() {
        val cached = AutoAuthStore::class.java.getDeclaredField("cachedProfile").apply { isAccessible = true }
        val previousProfile = cached.get(null)
        val previousSnapshot = WifiEnvironment.snapshotPort
        try {
            val target = AutoAuthWifiRule("Campus", true, emptyList(), autoConnect = true, id = "protected", security = "WPA2")
            cached.set(null, AutoAuthProfile(true, null, emptyList(), listOf(target)))
            WifiEnvironment.snapshotPort = {
                WifiEnvironment.Snapshot(enabled = true, connected = true, ssid = "Campus", ipv4 = "10.1.2.3", security = "Open")
            }
            val wait = WifiReconnector::class.java.getDeclaredMethod(
                "waitForConnection", Context::class.java, WifiReconnectPolicy.Candidate::class.java,
                kotlin.jvm.functions.Function0::class.java, Boolean::class.javaPrimitiveType,
            ).apply { isAccessible = true }
            val result = wait.invoke(
                WifiReconnector {}, mock(Context::class.java),
                WifiReconnectPolicy.Candidate("Campus", "fixture-passphrase", 1, "protected", "WPA2"),
                { true }, false,
            )
            assertEquals(false, result)
            assertEquals(-1, WifiSecurity.match(target, "Campus", "Open", null))
        } finally {
            cached.set(null, previousProfile)
            WifiEnvironment.snapshotPort = previousSnapshot
        }
    }
}
