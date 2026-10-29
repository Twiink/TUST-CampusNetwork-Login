package com.netmate.app.logging
import android.content.Context
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicBoolean

object NetMateLogs {
    @Volatile private var journal: SqliteJournal? = null
    private val queue = ArrayBlockingQueue<JSONObject>(128)
    private val bytes = AtomicInteger()
    private val dropped = AtomicInteger()
    @Volatile private var lastError: String? = null
    private val worker = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "netmate-journal").apply { isDaemon = true } }
    private val scheduled = AtomicBoolean()
    val listeners = CopyOnWriteArraySet<(JSONObject) -> Unit>()
    @Synchronized fun initialize(context: Context) { if (journal == null) { journal = SqliteJournal(context.applicationContext) } }
    fun append(context: Context, input: JSONObject): JSONObject {
        initialize(context)
        val entry = JSONObject(input.toString()).put("message", LogJournal.safe(input.optString("message")).take(16384))
        if (!entry.has("timestamp")) entry.put("timestamp", System.currentTimeMillis())
        val size = entry.toString().toByteArray().size
        if (size > 65536 || bytes.addAndGet(size) > 1024 * 1024) { bytes.addAndGet(-size); dropped.incrementAndGet(); return entry }
        if (!queue.offer(entry)) { bytes.addAndGet(-size); dropped.incrementAndGet() }
        scheduleFlush()
        return entry
    }
    private fun scheduleFlush() {
        if(scheduled.compareAndSet(false,true)) worker.schedule({
            try { flush() } finally { scheduled.set(false); if(queue.isNotEmpty() || dropped.get()>0) scheduleFlush() }
        },if(lastError==null)250 else 30000,TimeUnit.MILLISECONDS)
    }
    private fun flush() {
        val batch = mutableListOf<JSONObject>(); queue.drainTo(batch, 64)
        batch.forEach { bytes.addAndGet(-it.toString().toByteArray().size) }
        val lost = dropped.getAndSet(0)
        if (lost > 0) batch.add(JSONObject().put("level", "warn").put("source", "logging").put("message", "日志队列已满，省略 $lost 条记录"))
        if (batch.isNotEmpty()) {
            try { journal!!.appendBatch(batch); lastError = null; listeners.forEach { listener -> runCatching { listener(batch.last()) } } }
            catch (_: Exception) { dropped.addAndGet(batch.size); lastError = "日志写入失败，部分记录未保存，请检查存储空间" }
        }
    }
    private fun <T> read(action: (SqliteJournal) -> T): T = worker.submit<T> { repeat(2) { if(queue.isNotEmpty()) flush() }; action(journal ?: error("日志尚未初始化")) }.get()
    fun log(context: Context, level: String, message: String, source: String = "native") { append(context, JSONObject().put("level", level).put("message", message).put("source", source)) }
    fun queryHistory(context: Context, filter: JSONObject): JSONObject { initialize(context); return read { it.page(filter).apply { lastError?.let { error -> put("error", error) } } } }
    fun queryPage(context: Context, cursor: String?, limit: Int): JSONObject = queryHistory(context, JSONObject().put("cursor", cursor).put("limit", limit))
    fun query(context: Context, level: String?, limit: Int, offset: Int = 0): List<JSONObject> { val a = queryHistory(context, JSONObject().put("level", level).put("limit", limit)).getJSONArray("entries"); return (0 until a.length()).map(a::getJSONObject) }
    fun clear(context: Context): String { initialize(context); return read { it.clear() } }
    fun export(context: Context, filter: JSONObject, format: String, writer: java.io.Writer): Long { initialize(context); return read { check(lastError == null) { lastError!! }; it.export(filter, format, writer) } }
    // Compatibility test helper; production export always streams through export().
    fun history(context: Context, filter: JSONObject): List<JSONObject> { val a = queryHistory(context, filter).getJSONArray("entries"); return (0 until a.length()).map(a::getJSONObject) }
}
