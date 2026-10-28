package com.netmate.app.logging

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CopyOnWriteArraySet

object NetMateLogs {
    private var journal: LogJournal? = null
    val listeners = CopyOnWriteArraySet<(JSONObject) -> Unit>()
    @Synchronized fun initialize(context: Context) { if (journal == null) journal = LogJournal(File(context.filesDir, "logs")) }
    fun append(context: Context, input: JSONObject): JSONObject {
        initialize(context)
        val entry = journal!!.append(input)
        listeners.forEach { listener -> try { listener(entry) } catch (_: Exception) {} }
        return entry
    }
    fun log(context: Context, level: String, message: String, source: String = "native") {
        append(context, JSONObject().put("level", level).put("message", message).put("source", source))
    }
    fun query(context: Context, level: String?, limit: Int, offset: Int = 0): List<JSONObject> { initialize(context); return journal!!.query(level, limit, offset) }
    fun clear(context: Context): String { initialize(context); return journal!!.clear() }
    fun queryPage(context: Context, cursor: String?, limit: Int): JSONObject { initialize(context); return journal!!.queryPage(cursor, limit) }
}
