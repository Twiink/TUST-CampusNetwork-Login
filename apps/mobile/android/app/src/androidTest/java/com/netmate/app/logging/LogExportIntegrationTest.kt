package com.netmate.app.logging

import androidx.core.content.FileProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Runs after the UI export flow, under the signed test package's target application identity. */
@RunWith(AndroidJUnit4::class)
class LogExportIntegrationTest {
    @Test fun exportedJournalIsPersistedRedactedAndReadableThroughFileProvider() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val file = File(context.cacheDir, "exports/NetMate-diagnostic.log")
        assertTrue("The UI did not create an exported diagnostic file", file.isFile)
        val text = file.readText()
        val entries = text.lineSequence().filter { it.isNotBlank() }.map { JSONObject(it) }.toList()
        assertTrue("Export did not contain persisted entries", entries.isNotEmpty())
        assertTrue(entries.all { it.has("message") && it.get("message") is String })
        for (password in listOf("fake-password", "e2e-wifi-pass")) {
            assertFalse("An exported fixture password was not redacted", text.contains(password))
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val shared = context.contentResolver.openInputStream(uri)!!.bufferedReader().use { it.readText() }
        assertEquals("The system share URI did not resolve to the exported journal", text, shared)
        val artifact = File(requireNotNull(context.getExternalFilesDir(null)), "e2e-exported-diagnostic.log")
        artifact.writeText(shared)
    }
}
