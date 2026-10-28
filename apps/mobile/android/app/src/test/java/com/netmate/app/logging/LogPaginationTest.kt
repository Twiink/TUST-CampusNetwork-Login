package com.netmate.app.logging

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files

class LogPaginationTest {
    @Test fun concurrentAppendsAndEqualTimestampsDoNotShiftHistoryPages() {
        val dir = Files.createTempDirectory("netmate-pages").toFile()
        try {
            val now = System.currentTimeMillis()
            val journal = LogJournal(dir, { now })
            repeat(600) { journal.append(JSONObject().put("id", "fixture-${it.toString().padStart(4, '0')}").put("timestamp", now).put("message", "history")) }
            val first = journal.queryPage(null)
            assertEquals(500, first.getJSONArray("entries").length()); assertTrue(first.getBoolean("hasMore"))
            journal.append(JSONObject().put("id", "new").put("timestamp", now + 1).put("message", "live"))
            val second = journal.queryPage(first.getString("nextCursor"))
            assertEquals(100, second.getJSONArray("entries").length()); assertFalse(second.getBoolean("hasMore"))
            val ids = (0 until first.getJSONArray("entries").length()).map { first.getJSONArray("entries").getJSONObject(it).getString("id") } + (0 until second.getJSONArray("entries").length()).map { second.getJSONArray("entries").getJSONObject(it).getString("id") }
            assertEquals(600, ids.toSet().size)
            journal.clear(); assertEquals(0, journal.queryPage(null).getJSONArray("entries").length())
        } finally { dir.deleteRecursively() }
    }
}
