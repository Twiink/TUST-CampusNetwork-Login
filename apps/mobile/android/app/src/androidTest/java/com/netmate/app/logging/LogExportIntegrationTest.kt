package com.netmate.app.logging
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.StringWriter
/** Real SQLite, independent of the app's UI fixture state. */
@RunWith(AndroidJUnit4::class)
class LogExportIntegrationTest {
    @Test fun indexedHistoryPagesAndExportsBeyondTheUiLimit() {
        // Instrumentation runs as the target app UID; its own APK context has a
        // different data directory and cannot own the database being tested.
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        context.deleteDatabase("native-logs-v1.db")
        val journal = SqliteJournal(context)
        val entries = (0 until 1200).map { JSONObject().put("level", "info").put("source", "test").put("message", "record $it password=fixture-log-value").put("data",JSONObject().put("sequence",it)) }
        journal.appendBatch(entries)
        val first = journal.page(JSONObject())
        assertEquals(200, first.getJSONArray("entries").length())
        assertTrue(first.getBoolean("hasMore"))
        val writer = StringWriter()
        assertEquals(1200L, journal.export(JSONObject(), "json", writer))
        assertFalse(writer.toString().contains("fixture-log-value"))
        assertTrue(first.getJSONArray("entries").getJSONObject(0).getJSONObject("data").has("sequence"))
        journal.clear()
        try { journal.page(JSONObject().put("cursor", first.getString("nextCursor"))); fail("stale cursor was accepted") } catch (_: IllegalArgumentException) { }
        assertEquals(0, journal.page(JSONObject()).getJSONArray("entries").length())
        journal.close()
    }
}
