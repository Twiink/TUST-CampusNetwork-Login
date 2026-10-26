package com.netmate.app.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AutoAuthPolicyTest {

    private val campus = AutoAuthAccount("a1", "23103421", "pw", "campus", "")
    private val unicom = AutoAuthAccount("a2", "23103421", "pw", "cucc", "")

    private fun profile(
        enabled: Boolean = true,
        current: String? = "a1",
        rules: List<AutoAuthWifiRule> = emptyList(),
    ) = AutoAuthProfile(enabled, current, listOf(campus, unicom), rules)

    @Test
    fun `未配置 WiFi 按校园网 SSID + 10_x 判定`() {
        val decision = AutoAuthPolicy.decide(profile(), "TUST-5G", "10.59.16.97", captivePortal = false)
        assertTrue(decision.requiresAuth)
        assertEquals(listOf(campus), decision.accounts)

        assertTrue(AutoAuthPolicy.decide(profile(), "cu_tust", "10.1.1.1", false).requiresAuth)
        assertFalse(AutoAuthPolicy.decide(profile(), "TUST-5G", "192.168.1.2", false).requiresAuth)
        assertFalse(AutoAuthPolicy.decide(profile(), "HomeWiFi", "10.1.1.1", false).requiresAuth)
    }

    @Test
    fun `已配置 WiFi 以用户配置为准并使用关联账号序列`() {
        val rules = listOf(
            AutoAuthWifiRule("Lab", requiresAuth = true, linkedAccountIds = listOf("a2", "missing", "a1")),
            AutoAuthWifiRule("TUST-Guest", requiresAuth = false, linkedAccountIds = emptyList()),
        )
        val lab = AutoAuthPolicy.decide(profile(rules = rules), "Lab", "172.16.0.2", false)
        assertTrue(lab.requiresAuth)
        assertEquals(listOf(unicom, campus), lab.accounts)

        // 配置为无需认证时即使符合校园网启发式也不认证
        assertFalse(AutoAuthPolicy.decide(profile(rules = rules), "TUST-Guest", "10.1.1.1", false).requiresAuth)
    }

    @Test
    fun `关联账号全部失效时回退当前账号`() {
        val rules = listOf(AutoAuthWifiRule("Lab", true, listOf("missing")))
        assertEquals(listOf(campus), AutoAuthPolicy.decide(profile(rules = rules), "Lab", "10.0.0.2", false).accounts)
    }

    @Test
    fun `SSID 不可用时仅在强制门户 + 10_x 下认证`() {
        assertTrue(AutoAuthPolicy.decide(profile(), null, "10.0.0.2", captivePortal = true).requiresAuth)
        assertFalse(AutoAuthPolicy.decide(profile(), null, "10.0.0.2", captivePortal = false).requiresAuth)
        assertFalse(AutoAuthPolicy.decide(profile(), null, "192.168.0.2", captivePortal = true).requiresAuth)
    }

    @Test
    fun `关闭开关或缺少 IPv4 时不认证`() {
        assertFalse(AutoAuthPolicy.decide(profile(enabled = false), "TUST", "10.0.0.2", true).requiresAuth)
        assertFalse(AutoAuthPolicy.decide(profile(), "TUST", null, true).requiresAuth)
    }

    @Test
    fun `配置 JSON 解析`() {
        val parsed = AutoAuthProfile.fromJson(
            """{"enabled":true,"currentAccountId":null,
               "accounts":[{"id":"a1","username":"u","password":"p","isp":"cucc","serverUrl":"http://10.10.102.50:801"}],
               "wifiRules":[{"ssid":"TUST","requiresAuth":true,"linkedAccountIds":["a1"]}]}"""
        )
        assertTrue(parsed.enabled)
        assertEquals(null, parsed.currentAccountId)
        assertEquals("cucc", parsed.accounts.single().isp)
        assertEquals(listOf("a1"), parsed.wifiRules.single().linkedAccountIds)
    }
}
