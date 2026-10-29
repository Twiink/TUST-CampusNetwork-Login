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
        private val portalPattern = Regex("""(?i)https?://[^\s<>"']*/eportal/portal/(?:login|logout)(?:\?[^\s<>"']*)?""")
        fun safe(text: String): String = text
            .replace(Regex("""(?i)https?://[^\s<>"']*/eportal/portal/(?:login|logout)(?:\?[^\s<>"']*)?"""), "[门户请求地址]")
            .replace(Regex("""(?i)((?:user_password|password|passwd|psk|keyMaterial|access_token|token)\s*["']?\s*[=:]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s&\n]+)"""), "$1[REDACTED]")
            .replace(Regex("""(?i)(\b(?:password|passwd|psk)\s+)(?:"[^"\n]*"|'[^'\n]*'|[^\s\n]+)"""), "$1[REDACTED]")
            .replace(Regex("""(?i)(https?://)[^\s/@]+:[^\s/@]+@"""), "$1[REDACTED]@")
    }
    fun safeValue(value: Any?): Any? = when (value) {
        is JSONObject -> JSONObject().apply { value.keys().forEach { key -> put(key, if (key.matches(Regex("(?i)password|passwd|user_password|userPassword|wifiPassword|preSharedKey|keyMaterial|psk|authorization|cookie|token|access_token"))) "[REDACTED]" else safeValue(value.opt(key))) } }
        is org.json.JSONArray -> org.json.JSONArray((0 until value.length()).map { safeValue(value.opt(it)) })
        is String -> safe(value)
        else -> value
    }
    var readError: String? = null
        private set
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
        if (input.has("category")) entry.put("category", safe(input.optString("category")))
        if (input.has("data")) entry.put("data", safeValue(input.opt("data")))
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
            check(line.toByteArray(Charsets.UTF_8).size <= maxBytes) { "日志详情超过单文件大小限制，未能保存" }
        }
        if (file().length() + line.toByteArray(Charsets.UTF_8).size > maxBytes) {
            file(history).delete()
            for (index in history - 1 downTo 0) if (file(index).exists()) file(index).renameTo(file(index + 1))
        }
        file().appendText(line, Charsets.UTF_8)
        return entry
    }

    @Synchronized fun history(filter: JSONObject = JSONObject()): List<JSONObject> {
        prune(force = true)
        val threshold = now() - retentionMs
        val keyword = filter.optString("keyword").trim().lowercase()
        val source = filter.optString("source").lowercase()
        val level = filter.optString("level")
        val errors = mutableListOf<String>()
        val stored = (0..history).flatMap { index ->
            val target = file(index)
            if (!target.exists()) emptyList() else try {
                target.readLines(Charsets.UTF_8).filter { it.isNotBlank() }.mapIndexedNotNull { lineNumber, line ->
                    try { safeValue(JSONObject(line)) as JSONObject }
                    catch (_: Exception) { errors.add("${target.name} 第 ${lineNumber + 1} 行无法读取"); null }
                }
            } catch (_: Exception) { errors.add("${target.name} 无法读取"); emptyList() }
        }
        readError = errors.takeIf { it.isNotEmpty() }?.joinToString("\n")
        return stored.filter {
            val time = it.optLong("timestamp")
            time >= threshold && (level.isBlank() || level == "all" || it.optString("level") == level) &&
                (keyword.isBlank() || (it.optString("message") + " " + it.optString("source") + " " + it.opt("data")).lowercase().contains(keyword)) &&
                (source.isBlank() || it.optString("source").lowercase().contains(source)) &&
                (!filter.has("startTime") || time >= filter.optLong("startTime")) && (!filter.has("endTime") || time <= filter.optLong("endTime"))
        }.distinctBy { it.optString("id") }.sortedWith(compareByDescending<JSONObject> { it.optLong("timestamp") }.thenByDescending { it.optString("id") })
    }
    @Synchronized fun query(level: String? = null, limit: Int = 500, offset: Int = 0): List<JSONObject> =
        history(JSONObject().put("level", level)).drop(offset.coerceAtLeast(0)).take(limit.coerceAtLeast(1))

    @Synchronized fun queryPage(cursor: String?, limit: Int = 500, filter: JSONObject = JSONObject()): JSONObject {
        val before = cursor?.let { JSONObject(it) }
        val all = history(filter)
        val page = all.filter { entry -> before == null || entry.optLong("timestamp") < before.getLong("timestamp") || (entry.optLong("timestamp") == before.getLong("timestamp") && entry.optString("id") < before.getString("id")) }.take(limit.coerceIn(1, 500) + 1)
        val entries = page.take(limit.coerceIn(1, 500))
        val last = entries.lastOrNull()
        return JSONObject().put("entries", org.json.JSONArray(entries)).put("hasMore", page.size > entries.size).put("total", all.size).put("generation", generation)
            .put("error", readError).put("nextCursor", last?.let { JSONObject().put("timestamp", it.optLong("timestamp")).put("id", it.optString("id")).toString() } ?: JSONObject.NULL)
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
            val lines = try { target.readLines(Charsets.UTF_8) } catch (_: Exception) { return@forEach }
            val retained = try { lines.filter { it.isNotBlank() }.filter { line -> JSONObject(line).optLong("timestamp") >= threshold } } catch (_: Exception) { return@forEach }
            if (retained.isEmpty()) target.delete()
            else if (retained.size != lines.size) target.writeText(retained.joinToString("\n", postfix = "\n"), Charsets.UTF_8)
        }
    }
}
