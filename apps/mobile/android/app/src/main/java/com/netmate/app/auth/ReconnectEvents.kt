package com.netmate.app.auth
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet
object ReconnectEvents {
    val listeners = CopyOnWriteArraySet<(JSONObject) -> Unit>()
    @Volatile var latest = JSONObject().put("status", "idle")
    @Synchronized fun publish(value: JSONObject) {
        if (value.optString("status") == "cooldown" && !value.has("failedList") && latest.has("failedList")) value.put("failedList", latest.getJSONArray("failedList"))
        latest = value; listeners.forEach { try { it(value) } catch (_: Exception) {} } }
}
