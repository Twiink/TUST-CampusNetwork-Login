package com.netmate.app.auth

import java.net.InetAddress
import java.net.ServerSocket
import java.io.IOException
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.*
import org.junit.Test

/** Real HTTP transport; only packet boundaries and the server response are controlled. */
class FragmentedTransportTest {
    private fun <T> server(text: String, count: Int, action: (String, AtomicInteger) -> T): T {
        val requests = AtomicInteger()
        val server = ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))
        val bytes = text.toByteArray()
        val worker = Thread {
            try { repeat(count) {
                server.accept().use { socket ->
                    requests.incrementAndGet()
                    val input = socket.getInputStream().bufferedReader()
                    while (!input.readLine().isNullOrBlank()) { }
                    val body = socket.getOutputStream()
                    body.write("HTTP/1.1 200 OK\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray())
                    body.write(bytes, 0, 3); body.flush()
                    Thread.sleep(30)
                    body.write(bytes, 3, bytes.size - 3); body.flush()
                }
            } } catch (_: IOException) { }
        }.apply { isDaemon = true; start() }
        try { return action("http://127.0.0.1:${server.localPort}", requests) }
        finally { server.close(); worker.join(1000) }
    }
    @Test fun successfulFragmentedLoginNeedsOnlyOneRequest() = server("cb({\"status\":1,\"msg\":\"ok\"})", 1) { url, requests ->
        val outcome = PortalClient(sleeper = {}).login(PortalClient.Credentials("fixture", "fixture-only", "campus", url), "10.1.2.3", null, null)
        assertTrue(outcome.success); assertEquals(1, outcome.attempts); assertEquals(1, requests.get())
    }
    @Test fun fragmentedRejectionIsParsedWithTheExistingRetryLimit() = server("cb({\"status\":0,\"msg\":\"denied\"})", 3) { url, requests ->
        val outcome = PortalClient(sleeper = {}).login(PortalClient.Credentials("fixture", "fixture-only", "campus", url), "10.1.2.3", null, null)
        assertFalse(outcome.success); assertEquals(3, outcome.attempts); assertEquals(3, requests.get()); assertEquals("denied", outcome.message)
    }
    @Test fun fragmentedLogoutIsParsedCompletely() = server("cb({\"result\":1})", 1) { url, requests ->
        assertTrue(PortalClient().logout(url, null).success); assertEquals(1, requests.get())
    }
    @Test fun oversizedBodyCannotTurnASuccessPrefixIntoACompleteResponse() = server("cb({\"status\":1})" + " ".repeat(8192), 1) { url, _ ->
        try { UrlConnectionTransport().get(url, null, 1000, true); fail("expected response length error") }
        catch (e: IOException) { assertTrue(e.message.orEmpty().contains("8192")) }
    }
}
