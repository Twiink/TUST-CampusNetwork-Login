package com.netmate.app.auth

import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class ProtocolFixtureTest {
    @Test fun sharedTypeScriptKotlinRequestsMatchByteForByte() {
        val content = javaClass.classLoader!!.getResourceAsStream("portal-protocol.json")!!.bufferedReader().use { it.readText() }
        val samples = JSONArray(content)
        for (index in 0 until samples.length()) {
            val sample = samples.getJSONObject(index)
            assertEquals(sample.getString("isp"), sample.getString("url"), PortalClient.buildLoginUrl(
                "http://portal.test/", sample.getString("username"), sample.getString("password"), sample.getString("isp"),
                sample.getString("ipv4"), if (sample.isNull("ipv6")) null else sample.getString("ipv6")))
        }
    }
    @Test fun logoutAcceptsResultOneAndRejectsLoginStatus() {
        var body = "jsonpReturn({\"result\":1,\"msg\":\"ok\"})"
        val client = PortalClient(object : PortalClient.Transport {
            override fun get(url: String, network: android.net.Network?, timeoutMs: Int, readBody: Boolean) = 200 to body
        })
        assertTrue(client.logout("http://portal.test", null).success)
        body = "{\"status\":1}"
        assertFalse(client.logout("http://portal.test", null).success)
    }
    @Test fun oldProfilesDefaultToUnpausedAndPauseStopsOnlyPortalAuthentication() {
        val profile = AutoAuthProfile.fromJson("""{"enabled":true,"accounts":[],"wifiRules":[{"ssid":"TUST","autoConnect":true}]}""")
        assertFalse(profile.authPaused)
        val paused = profile.copy(authPaused = true)
        assertFalse(AutoAuthPolicy.decide(paused, "TUST", "10.1.2.3", true).requiresAuth)
        assertEquals(1, paused.autoConnectWifis.size)
    }
}
