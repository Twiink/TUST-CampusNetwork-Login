package com.netmate.app.auth

import android.net.Network
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.net.InetAddress

class PortalClientTest {

    private class FakeTransport(private val responder: (String) -> Pair<Int, String>) : PortalClient.Transport {
        val requests = mutableListOf<String>()
        override fun get(url: String, network: Network?, timeoutMs: Int, readBody: Boolean): Pair<Int, String> {
            requests.add(url)
            return responder(url)
        }
    }

    private val credentials = PortalClient.Credentials("23103421", "p@ss word", "campus", "")

    @Test
    fun `登录 URL 与参考实现参数一致`() {
        val url = PortalClient.buildLoginUrl(
            "http://10.10.102.50:801", "23103421", "p@ss word", "cucc", "10.59.16.97", "2001:da8::1"
        )
        assertEquals(
            "http://10.10.102.50:801/eportal/portal/login?callback=dr1005&login_method=1" +
                "&user_account=%2C0%2C23103421%40unicom&user_password=p%40ss%20word" +
                "&wlan_user_ip=10.59.16.97" +
                "&wlan_user_mac=000000000000&jsVersion=4.1.3&terminal_type=3&lang=zh-cn&v=9303&wlan_user_ipv6=2001%3Ada8%3A%3A1",
            url
        )
    }

    @Test
    fun `校园网账号不加后缀，IPv6 缺失时省略`() {
        assertEquals(",0,23103421", PortalClient.buildUserAccount("23103421", "campus"))
        val url = PortalClient.buildLoginUrl("http://10.10.102.50:801/", "a", "b", "campus", "10.0.0.2", null)
        assertTrue(url.startsWith("http://10.10.102.50:801/eportal/portal/login?"))
        assertFalse(url.contains("wlan_user_ipv6"))
    }

    @Test
    fun `成功判定对齐参考实现`() {
        assertTrue(PortalClient.isLoginSuccess("dr1005({\"result\":1,\"status\":1,\"msg\":\"认证成功\"})"))
        assertTrue(PortalClient.isLoginSuccess("dr1005({\"status\" : 1})"))
        assertTrue(PortalClient.isLoginSuccess("您的账号已经在线！"))
        assertFalse(PortalClient.isLoginSuccess("dr1005({\"result\":0,\"ret_code\":1,\"msg\":\"密码错误\"})"))
        assertFalse(PortalClient.isLoginSuccess("dr1005({\"status\":0})"))
    }

    @Test
    fun `失败时最多 3 次、间隔 2 秒，返回门户 msg`() {
        val sleeps = mutableListOf<Long>()
        val transport = FakeTransport { 200 to "dr1005({\"result\":0,\"msg\":\"密码错误\"})" }
        val outcome = PortalClient(transport) { sleeps.add(it) }.login(credentials, "10.0.0.2", null, null)

        assertFalse(outcome.success)
        assertEquals("密码错误", outcome.message)
        assertEquals(3, transport.requests.size)
        assertEquals(listOf(2000L, 2000L), sleeps)
    }

    @Test
    fun `网络异常后重试成功`() {
        var calls = 0
        val transport = FakeTransport {
            calls += 1
            if (calls == 1) throw IOException("timeout")
            200 to "dr1005({\"status\":1})"
        }
        val outcome = PortalClient(transport) {}.login(credentials, "10.0.0.2", null, null)

        assertTrue(outcome.success)
        assertEquals(2, outcome.attempts)
    }

    @Test
    fun `在线探测只信任严格 204`() {
        val portalHijack = PortalClient(FakeTransport { 200 to "" }) {}
        assertFalse(portalHijack.isOnline(null))

        val oneOk = PortalClient(FakeTransport { url -> if (url.contains("miui")) 204 to "" else throw IOException() }) {}
        assertTrue(oneOk.isOnline(null))
    }

    @Test
    fun `IP 选取优先 10_x 与全局 IPv6`() {
        val addresses = listOf(
            "192.168.1.5", "fe80::1", "fd00::3", "10.59.16.97", "2001:da8::7", "127.0.0.1"
        ).map { InetAddress.getByName(it) }

        assertEquals("10.59.16.97", LocalAddresses.selectIPv4(addresses))
        assertEquals("2001:da8:0:0:0:0:0:7", LocalAddresses.selectIPv6(addresses))
        assertEquals("fd00:0:0:0:0:0:0:3", LocalAddresses.selectIPv6(addresses.filterNot { it.hostAddress == "2001:da8:0:0:0:0:0:7" }))
    }
}
