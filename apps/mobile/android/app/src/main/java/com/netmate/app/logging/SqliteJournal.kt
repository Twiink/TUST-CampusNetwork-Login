package com.netmate.app.logging

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.Writer

/** Indexed, bounded-memory log storage. Only the :network process owns this database. */
internal class SqliteJournal(context: Context) : SQLiteOpenHelper(context, "native-logs-v1.db", null, 1) {
    private var payloadBytes: Long? = null
    private var lastPrune = 0L
    private val sanitizer = LogJournal(java.io.File("."))
    init { setWriteAheadLoggingEnabled(true) }
    override fun onConfigure(db: SQLiteDatabase) {
        db.execSQL("PRAGMA cache_size=-512")
        db.rawQuery("PRAGMA mmap_size=0", null).use { it.moveToFirst() }
        db.rawQuery("PRAGMA journal_size_limit=1048576", null).use { it.moveToFirst() }
        db.rawQuery("PRAGMA wal_autocheckpoint=128", null).use { it.moveToFirst() }
        db.rawQuery("PRAGMA max_page_count=8192", null).use { it.moveToFirst() }
    }
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE logs(seq INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER NOT NULL, level TEXT NOT NULL, source TEXT NOT NULL, message TEXT NOT NULL, data TEXT, bytes INTEGER NOT NULL)")
        db.execSQL("CREATE INDEX logs_time ON logs(timestamp DESC,seq DESC)")
        db.execSQL("CREATE INDEX logs_level ON logs(level,timestamp DESC,seq DESC)")
        db.execSQL("CREATE TABLE meta(generation INTEGER NOT NULL)")
        db.execSQL("INSERT INTO meta VALUES(1)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
    private fun generation(): Long = readableDatabase.rawQuery("SELECT generation FROM meta", null).use { it.moveToFirst(); it.getLong(0) }
    fun appendBatch(entries: List<JSONObject>) {
        val db = writableDatabase
        if (payloadBytes == null) payloadBytes = db.rawQuery("SELECT COALESCE(SUM(bytes),0) FROM logs", null).use { it.moveToFirst(); it.getLong(0) }
        var addedBytes = 0L
        var committedBytes = payloadBytes ?: 0L
        var prunedAt = lastPrune
        db.beginTransaction()
        try {
            entries.forEach { entry ->
                val message = LogJournal.safe(entry.optString("message")).take(16384)
                val safe = sanitizer.safeValue(entry.opt("data"))
                var data = when(safe) { null -> "null"; is JSONObject, is JSONArray, is Number, is Boolean -> safe.toString(); else -> JSONObject.quote(safe.toString()) }
                if (data.length > 16384) data=JSONObject().put("truncated",true).put("preview",data.take(16384)).toString()
                val entryBytes = message.toByteArray().size + data.toByteArray().size + 128
                addedBytes += entryBytes
                db.insertOrThrow("logs", null, ContentValues().apply {
                    put("timestamp", entry.optLong("timestamp", System.currentTimeMillis()))
                    put("level", entry.optString("level", "info")); put("source", entry.optString("source", "native").take(64))
                    put("message", message); put("data", data); put("bytes", entryBytes)
                })
            }
            var bytes = (payloadBytes ?: 0L) + addedBytes
            if (System.currentTimeMillis() - lastPrune > 3600000) {
                db.execSQL("DELETE FROM logs WHERE timestamp < ?", arrayOf(System.currentTimeMillis() - 7L * 86400000))
                bytes = db.rawQuery("SELECT COALESCE(SUM(bytes),0) FROM logs", null).use { it.moveToFirst(); it.getLong(0) }
                prunedAt = System.currentTimeMillis()
            }
            while (bytes > 20L * 1024 * 1024) {
                db.execSQL("DELETE FROM logs WHERE seq IN (SELECT seq FROM logs ORDER BY timestamp,seq LIMIT 256)")
                bytes = db.rawQuery("SELECT COALESCE(SUM(bytes),0) FROM logs", null).use { it.moveToFirst(); it.getLong(0) }
            }
            db.setTransactionSuccessful()
            committedBytes = bytes
        } finally { db.endTransaction() }
        payloadBytes = committedBytes
        lastPrune = prunedAt
    }
    fun page(filter: JSONObject, includeTotal: Boolean = true): JSONObject {
        val cursor = filter.optString("cursor").takeIf { it.isNotBlank() && it != "null" }?.let(::JSONObject)
        val generation = generation()
        require(cursor == null || cursor.getLong("generation") == generation) { "日志已清空，请重新查询" }
        val where = mutableListOf("timestamp>=?", "timestamp<=?")
        val args = mutableListOf(maxOf(filter.optLong("startTime", 0), System.currentTimeMillis() - 7L * 86400000).toString(), filter.optLong("endTime", Long.MAX_VALUE).toString())
        filter.optString("level").takeIf { it.isNotBlank() && it != "all" }?.let { where.add("level=?"); args.add(it) }
        filter.optString("source").takeIf { it.isNotBlank() }?.let { where.add("instr(lower(source),lower(?))>0"); args.add(it) }
        filter.optString("keyword").takeIf { it.isNotBlank() }?.let { where.add("instr(lower(message||' '||source||' '||COALESCE(data,'')),lower(?))>0"); args.add(it) }
        val total = if (includeTotal) readableDatabase.rawQuery("SELECT COUNT(*) FROM logs WHERE ${where.joinToString(" AND ")}", args.toTypedArray()).use { it.moveToFirst(); it.getLong(0) } else 0L
        if (cursor != null) { where.add("(timestamp<? OR (timestamp=? AND seq<?))"); args.add(cursor.getLong("timestamp").toString()); args.add(cursor.getLong("timestamp").toString()); args.add(cursor.getLong("id").toString()) }
        val limit = filter.optInt("limit", 200).coerceIn(1, 200)
        val entries = JSONArray(); var more = false; var payload = 0
        readableDatabase.rawQuery("SELECT seq,timestamp,level,source,message,data FROM logs WHERE ${where.joinToString(" AND ")} ORDER BY timestamp DESC,seq DESC LIMIT ${limit + 1}", args.toTypedArray()).use { rows ->
            while (rows.moveToNext()) {
                val entry = JSONObject().put("id", rows.getLong(0)).put("timestamp", rows.getLong(1)).put("level", rows.getString(2)).put("source", rows.getString(3)).put("message", rows.getString(4)).put("data", rows.getString(5)?.let{JSONTokener(it).nextValue()} ?: JSONObject.NULL).put("generation", generation)
                payload += entry.toString().toByteArray().size
                if (entries.length() == limit || payload > 256 * 1024) { more = true; break }
                entries.put(entry)
            }
        }
        val last = if (entries.length() > 0) entries.getJSONObject(entries.length() - 1) else null
        return JSONObject().put("entries", entries).put("hasMore", more).put("total", total).put("generation", generation).put("nextCursor", last?.let { JSONObject().put("generation", generation).put("timestamp", it.getLong("timestamp")).put("id", it.getLong("id")).toString() } ?: JSONObject.NULL)
    }
    fun clear(): String { writableDatabase.beginTransaction(); try { writableDatabase.execSQL("DELETE FROM logs"); writableDatabase.execSQL("UPDATE meta SET generation=generation+1"); writableDatabase.setTransactionSuccessful() } finally { writableDatabase.endTransaction() }; payloadBytes = 0L; return generation().toString() }
    fun export(filter: JSONObject, format: String, writer: Writer): Long {
        val query = JSONObject(filter.toString()).apply { remove("cursor"); put("limit", 200) }
        var count = 0L
        if (format == "json") writer.write("{\"app\":\"NetMate\",\"version\":\"2.0.0\",\"entries\":[") else writer.write("NetMate 2.0.0 / Android ${android.os.Build.VERSION.RELEASE}\n")
        do {
            val page = page(query, false); val entries = page.getJSONArray("entries")
            for (i in 0 until entries.length()) { val entry = entries.getJSONObject(i); if (format == "json") { if (count > 0) writer.write(","); writer.write(entry.toString()) } else writer.write("${entry.optLong("timestamp")} [${entry.optString("level")}] [${entry.optString("source")}] ${entry.optString("message")} ${entry.optString("data")}\n"); count++ }
            query.put("cursor", page.opt("nextCursor"))
        } while (page.getBoolean("hasMore"))
        if (format == "json") writer.write("]}\n")
        writer.flush(); return count
    }
}
