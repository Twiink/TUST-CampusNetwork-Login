package com.netmate.app.logging

import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Append-only journal; independent of Android so retention and redaction are JVM tested. */
class LogJournal(
    private val directory: File,
    private val now: () -> Long = System::currentTimeMillis,
    private val maxBytes: Long = 5L * 1024 * 1024,
    private val history: Int = 3,
    private val retentionMs: Long = 7L * 24 * 60 * 60 * 1000,
) {
    companion object {
        fun safe(text: String): String = text
            .replace(Regex("""(?i)https?://[^\s<>"']*/eportal/portal/(?:login|logout)(?:\?[^\s<>"']*)?"""), "[门户请求地址]")
            .replace(Regex("""(?i)((?:user_password|password|passwd|psk|keyMaterial|access_token|token)\s*["']?\s*[=:]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s&\n]+)"""), "$1[REDACTED]")
            .replace(Regex("""(?i)(\b(?:password|passwd|psk)\s+)(?:"[^"\n]*"|'[^'\n]*'|[^\s\n]+)"""), "$1[REDACTED]")
            .replace(Regex("""(?i)(https?://)[^\s/@]+:[^\s/@]+@"""), "$1[REDACTED]@")
    }
    private var generation = UUID.randomUUID().toString()
    private var lastPrunedAt = Long.MIN_VALUE
    private fun file(index: Int = 0) = File(directory, if (index == 0) "netmate.log" else "netmate.$index.log")

    @Synchronized fun append(input: JSONObject): JSONObject {
        directory.mkdirs()
        prune()
        val entry = JSONObject().put("generation", generation)
            .put("id", safe(input.optString("id").ifBlank { UUID.randomUUID().toString() }).take(128))
            .put("timestamp", input.optLong("timestamp", now()))
            .put("level", input.optString("level", "info").takeIf { it in setOf("debug", "info", "success", "warn", "error") } ?: "info")
            .put("message", safe(input.optString("message")).take((maxBytes / 4 - 128).coerceAtLeast(0).toInt()))
            .put("source", safe(input.optString("source", "app")).take(64))
        if (entry.optLong("timestamp") < now() - retentionMs) return entry
        val message = entry.getString("message")
        var line = entry.toString() + "\n"
        // JSON escapes control characters to six bytes, so character count alone is insufficient.
        if (line.toByteArray(Charsets.UTF_8).size > maxBytes) {
            var low = 0
            var high = message.length
            while (low < high) {
                val middle = (low + high + 1) / 2
                entry.put("message", message.take(middle))
                if ((entry.toString() + "\n").toByteArray(Charsets.UTF_8).size <= maxBytes) low = middle else high = middle - 1
            }
            entry.put("message", message.take(low))
            line = entry.toString() + "\n"
            if (line.toByteArray(Charsets.UTF_8).size > maxBytes) return entry
        }
        if (file().length() + line.toByteArray(Charsets.UTF_8).size > maxBytes) {
            file(history).delete()
            for (index in history - 1 downTo 0) if (file(index).exists()) file(index).renameTo(file(index + 1))
        }
        file().appendText(line, Charsets.UTF_8)
        return entry
    }

    @Synchronized fun query(level: String? = null, limit: Int = 500, offset: Int = 0): List<JSONObject> {
        prune(force = true)
        val threshold = now() - retentionMs
        return (0..history).flatMap { index ->
            if (!file(index).exists()) emptyList() else file(index).readLines(Charsets.UTF_8).asReversed().mapNotNull { line ->
                try { JSONObject(line).also { it.put("message", safe(it.optString("message"))) } } catch (_: Exception) { null }
            }
        }.filter { it.optLong("timestamp") >= threshold && (level == null || level == "all" || it.optString("level") == level) }
            .sortedWith(compareByDescending<JSONObject> { it.optLong("timestamp") }.thenByDescending { it.optString("id") })
            .drop(offset.coerceAtLeast(0)).take(limit.coerceIn(1, 100_000))
    }
    @Synchronized fun queryPage(cursor: String?, limit: Int = 500): JSONObject {
        val before = cursor?.let { JSONObject(it) }
        val page = query(limit = 100_000).filter { entry -> before == null || entry.optLong("timestamp") < before.getLong("timestamp") || (entry.optLong("timestamp") == before.getLong("timestamp") && entry.optString("id") < before.getString("id")) }.take(limit.coerceIn(1, 500) + 1)
        val entries = page.take(limit.coerceIn(1, 500))
        val last = entries.lastOrNull()
        return JSONObject().put("entries", org.json.JSONArray(entries)).put("hasMore", page.size > entries.size)
            .put("nextCursor", last?.let { JSONObject().put("timestamp", it.optLong("timestamp")).put("id", it.optString("id")).toString() } ?: JSONObject.NULL)
    }
    @Synchronized fun clear(): String { (0..history).forEach { check(!file(it).exists() || file(it).delete()) { "日志清空失败" } }; generation = UUID.randomUUID().toString(); return generation }
    private fun prune(force: Boolean = false) {
        val timestamp = now()
        if (!force && lastPrunedAt != Long.MIN_VALUE && timestamp - lastPrunedAt < 3_600_000) return
        lastPrunedAt = timestamp
        val threshold = timestamp - retentionMs
        (0..history).forEach { index ->
            val target = file(index)
            if (!target.exists()) return@forEach
            val lines = target.readLines(Charsets.UTF_8)
            val retained = lines.filter { line -> try { JSONObject(line).optLong("timestamp") >= threshold } catch (_: Exception) { false } }
            if (retained.isEmpty()) target.delete()
            else if (retained.size != lines.size) target.writeText(retained.joinToString("\n", postfix = "\n"), Charsets.UTF_8)
        }
    }
}
