package com.netmate.app.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WifiReconnectPolicyTest {

    private fun c(ssid: String, priority: Int) = WifiReconnectPolicy.Candidate(ssid, "", priority)

    @Test
    fun `断开的 WiFi 排第一，其余按优先级`() {
        val plan = WifiReconnectPolicy.plan(
            "Lab",
            listOf(c("Home", 5), c("Lab", 8), c("TUST", 1), c("Cafe", 5)),
        )
        assertEquals(listOf("Lab", "TUST", "Home", "Cafe"), plan.map { it.ssid })
    }

    @Test
    fun `启动连接时没有断开的 WiFi，纯按优先级`() {
        val plan = WifiReconnectPolicy.plan(null, listOf(c("B", 3), c("A", 1)))
        assertEquals(listOf("A", "B"), plan.map { it.ssid })
    }

    @Test
    fun `冷却期判定`() {
        val fiveMinutes = 5 * 60_000L
        assertFalse(WifiReconnectPolicy.inCooldown(0L, fiveMinutes, 1_000_000L))
        assertTrue(WifiReconnectPolicy.inCooldown(1_000_000L, fiveMinutes, 1_000_000L + fiveMinutes - 1))
        assertFalse(WifiReconnectPolicy.inCooldown(1_000_000L, fiveMinutes, 1_000_000L + fiveMinutes))
        // 冷却时长为 0 表示不冷却
        assertFalse(WifiReconnectPolicy.inCooldown(1_000_000L, 0L, 1_000_001L))
    }

    @Test
    fun `配置 JSON 解析设置项与通知开关，旧版 JSON 使用默认值`() {
        val parsed = AutoAuthProfile.fromJson(
            """{"enabled":true,"currentAccountId":"a1","accounts":[],
               "wifiRules":[{"ssid":"TUST","requiresAuth":true,"linkedAccountIds":[],
                             "password":"pw","autoConnect":true,"priority":2},
                            {"ssid":"Guest","requiresAuth":false,"linkedAccountIds":[]}],
               "heartbeatEnabled":false,"failureThreshold":5,"wifiRetries":2,"wifiCooldownMinutes":10,
               "startupAutoConnect":true,"keepCurrentConnection":false,
               "notifications":{"wifiDisconnected":false,"reconnectSuccess":true,
                                "reconnectFailed":false,"authRecovered":true}}"""
        )
        assertFalse(parsed.heartbeatEnabled)
        assertEquals(5, parsed.failureThreshold)
        assertEquals(2, parsed.wifiRetries)
        assertEquals(10, parsed.wifiCooldownMinutes)
        assertTrue(parsed.startupAutoConnect)
        assertFalse(parsed.keepCurrentConnection)
        assertEquals(listOf("TUST"), parsed.autoConnectWifis.map { it.ssid })
        assertEquals("pw", parsed.autoConnectWifis.single().password)
        assertFalse(EventNotifier.isEnabled(parsed.notifications, EventNotifier.Kind.WIFI_DISCONNECTED))
        assertTrue(EventNotifier.isEnabled(parsed.notifications, EventNotifier.Kind.AUTH_RECOVERED))

        val legacy = AutoAuthProfile.fromJson("""{"enabled":true,"accounts":[],"wifiRules":[]}""")
        assertTrue(legacy.heartbeatEnabled)
        assertEquals(3, legacy.failureThreshold)
        assertEquals(3, legacy.wifiRetries)
        assertEquals(5, legacy.wifiCooldownMinutes)
        assertTrue(legacy.keepCurrentConnection)
        assertTrue(legacy.notifications.reconnectFailed)
    }

    @Test
    fun `非法数值被修正到合理下限`() {
        val parsed = AutoAuthProfile.fromJson(
            """{"enabled":true,"accounts":[],"wifiRules":[],"failureThreshold":0,"wifiRetries":-1,"wifiCooldownMinutes":-5}"""
        )
        assertEquals(1, parsed.failureThreshold)
        assertEquals(1, parsed.wifiRetries)
        assertEquals(0, parsed.wifiCooldownMinutes)
    }
}
