package com.netmate.app.bridge
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import org.json.JSONObject
import org.json.JSONArray
private fun nativeValue(value: Any?): Any? = when (value) {
    JSONObject.NULL -> null
    is JSONObject -> value.keys().asSequence().associateWith { nativeValue(value.opt(it)) }
    is JSONArray -> (0 until value.length()).map { nativeValue(value.opt(it)) }
    else -> value
}
fun JSONObject.toNativeMap(): WritableMap = Arguments.makeNativeMap(keys().asSequence().associateWith { nativeValue(opt(it)) })
