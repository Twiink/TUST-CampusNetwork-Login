package com.netmate.app.logging
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files

class LogJournalTest {
    @Test fun removesPortalUrlsJsonSecretsAndEmbeddedCredentials() {
        val redacted = LogJournal.safe("http://portal.test/eportal/portal/login?user_password=url-secret {\"password\":\"json secret\"} http://user:basic-secret@host.test/")
        listOf("url-secret", "json secret", "basic-secret", "/eportal/portal/login").forEach { assertFalse(redacted.contains(it)) }
    }
    @Test fun redactsRotatesRestoresFiltersAndClears() {
        val directory = Files.createTempDirectory("netmate-logs").toFile()
        try {
            val now = System.currentTimeMillis()
            val journal = LogJournal(directory, { now }, maxBytes = 800)
            repeat(60) { journal.append(JSONObject().put("message", "password=secret-$it user_password=portal-secret").put("level", if (it % 2 == 0) "debug" else "warn")) }
            assertTrue(directory.listFiles()!!.size <= 4)
            directory.listFiles()!!.forEach { assertTrue(it.length() <= 800); assertFalse(it.readText().contains("portal-secret")) }
            val restored = LogJournal(directory, { now }, maxBytes = 800)
            assertTrue(restored.query("debug").isNotEmpty())
            assertTrue(restored.query("debug").all { it.getString("level") == "debug" })
            restored.clear(); assertTrue(restored.query().isEmpty())
        } finally { directory.deleteRecursively() }
    }
    @Test fun removesExpiredLinesFromAnActiveFile() {
        val directory = Files.createTempDirectory("netmate-retention-active").toFile()
        try {
            var now = System.currentTimeMillis()
            val journal = LogJournal(directory, { now })
            journal.append(JSONObject().put("message", "old-entry"))
            now += 8L * 86400000
            journal.append(JSONObject().put("message", "current-entry"))
            assertEquals(1, journal.query().size)
            assertFalse(directory.listFiles()!!.any { it.readText().contains("old-entry") })
        } finally { directory.deleteRecursively() }
    }
    @Test fun excludesExpiredEntriesAndBoundsLargeMessages() {
        val directory = Files.createTempDirectory("netmate-retention").toFile()
        try {
            val now = System.currentTimeMillis()
            val journal = LogJournal(directory, { now }, maxBytes = 1024)
            journal.append(JSONObject().put("timestamp", now - 8L * 86400000).put("message", "expired"))
            journal.append(JSONObject().put("message", "中".repeat(10000)))
            journal.append(JSONObject().put("message", "\u0000".repeat(10000)))
            assertFalse(directory.listFiles()!!.any { it.readText().contains("expired") })
            assertTrue(journal.query().none { it.optString("message") == "expired" })
            assertTrue(directory.listFiles()!!.all { it.length() <= 1024 })
        } finally { directory.deleteRecursively() }
    }
    @Test fun fullHistoryFiltersPagesAndPreservesStructuredDetailsAcrossRestart() {
        val directory = Files.createTempDirectory("netmate-history").toFile()
        try {
            val now = System.currentTimeMillis()
            val journal = LogJournal(directory, { now })
            repeat(1200) { index -> journal.append(JSONObject().put("id", "id-$index").put("timestamp", now - index).put("message", "event-$index").put("source", if (index == 1199) "portal" else "wifi").put("category", "network").put("data", JSONObject().put("password", "fixture-secret").put("index", index))) }
            val restored = LogJournal(directory, { now })
            val page = restored.queryPage(null, 500)
            assertEquals(1200, page.getInt("total")); assertTrue(page.getBoolean("hasMore"))
            val next = restored.queryPage(page.getString("nextCursor"), 500)
            assertEquals(500, next.getJSONArray("entries").length())
            val filtered = restored.queryPage(null, 200, JSONObject().put("source", "portal").put("keyword", "1199").put("startTime", now - 1200))
            assertEquals(1, filtered.getInt("total"))
            assertEquals("[REDACTED]", filtered.getJSONArray("entries").getJSONObject(0).getJSONObject("data").getString("password"))
            assertEquals(1200, restored.history().size)
        } finally { directory.deleteRecursively() }
    }
    @Test fun damagedHistoryKeepsReadableRecordsAndReportsTheFile() {
        val directory = Files.createTempDirectory("netmate-readable").toFile()
        try {
            val journal = LogJournal(directory)
            journal.append(JSONObject().put("message", "before"))
            java.io.File(directory, "netmate.log").appendText("{broken\n")
            journal.append(JSONObject().put("message", "after"))
            val page = journal.queryPage(null, 200)
            assertEquals(2, page.getInt("total"))
            assertTrue(page.getString("error").contains("第 2 行"))
            assertTrue(java.io.File(directory, "netmate.log").readText().contains("{broken"))
        } finally { directory.deleteRecursively() }
    }
    @Test fun concurrentClearAndAppendAreConsistentWithTheReturnedGeneration() {
        val directory = Files.createTempDirectory("netmate-clear-race").toFile()
        try {
            val journal = LogJournal(directory)
            journal.append(JSONObject().put("message", "old"))
            val barrier = java.util.concurrent.CyclicBarrier(2)
            var generation: String? = null
            var entry: JSONObject? = null
            val clear = Thread { barrier.await(); generation = journal.clear() }
            val write = Thread { barrier.await(); entry = journal.append(JSONObject().put("message", "new")) }
            clear.start(); write.start(); clear.join(); write.join()
            assertEquals(if (entry!!.getString("generation") == generation) listOf("new") else emptyList<String>(), journal.history().map { it.getString("message") })
        } finally { directory.deleteRecursively() }
    }
}
