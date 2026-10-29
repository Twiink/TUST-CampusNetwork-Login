package com.netmate.app.auth

import org.junit.Assert.*
import org.junit.Test
import java.net.ServerSocket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

class ConcurrentProbeTest {
    @Test fun valid204ReturnsBeforeOtherProbeTimeouts() {
        val slow=ServerSocket(0);val fast=ServerSocket(0)
        val waiting=CountDownLatch(1)
        val slowThread=thread(isDaemon=true) { runCatching { slow.accept().use { socket -> waiting.countDown(); socket.getInputStream().readBytes() } } }
        val fastThread=thread(isDaemon=true) { runCatching { fast.accept().use { socket ->
            val reader=socket.getInputStream().bufferedReader()
            while(!reader.readLine().isNullOrEmpty()) { }
            assertTrue(waiting.await(2,TimeUnit.SECONDS))
            socket.getOutputStream().write("HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n".toByteArray())
        } } }
        try {
            val client=PortalClient(probeUrls=listOf("http://127.0.0.1:${slow.localPort}/slow","http://127.0.0.1:${fast.localPort}/fast"))
            val start=System.nanoTime()
            assertTrue(client.isOnline(null))
            assertTrue("Slow probe delayed the valid 204",System.nanoTime()-start<TimeUnit.SECONDS.toNanos(2))
            slowThread.join(1500)
            assertFalse("Cancelled probe kept its socket open",slowThread.isAlive)
        }finally{slow.close();fast.close();fastThread.join(500)}
    }
}
