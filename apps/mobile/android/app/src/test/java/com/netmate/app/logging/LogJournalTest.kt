package com.netmate.app.logging
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files

class LogJournalTest {
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
}
