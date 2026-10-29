package com.netmate.app.auth

object WifiSecurity {
    fun normalize(value: String?): String {
        val text = value.orEmpty().uppercase()
        return when {
            text.isBlank() || text == "UNKNOWN" -> ""
            Regex("EAP|ENTERPRISE|企业").containsMatchIn(text) -> "enterprise"
            text.contains("WEP") -> "wep"
            Regex("SAE|WPA3").containsMatchIn(text) -> if (Regex("PSK|WPA2").containsMatchIn(text)) "wpa2-wpa3" else "wpa3"
            Regex("WPA|PSK|RSN").containsMatchIn(text) -> "wpa2"
            Regex("OPEN|NONE|开放|^--$").containsMatchIn(text) -> "open"
            else -> text.lowercase()
        }
    }
    fun systemSettingsOnly(security: String?) = normalize(security) in setOf("enterprise", "wep")
    fun connected(rule: AutoAuthWifiRule, state: WifiEnvironment.Snapshot) = state.connected && !state.ipv4.isNullOrBlank() && match(rule, state.ssid, state.security, state.bssid) >= 0
    fun matches(expected: String, actual: String) = expected == actual || (expected == "wpa2-wpa3" && actual in setOf("wpa2", "wpa3"))
    fun bssid(value: String?): String = value.orEmpty().replace(":", "").replace("-", "").lowercase().takeIf { it.matches(Regex("[0-9a-f]{12}")) && it != "020000000000" }.orEmpty()
    fun match(rule: AutoAuthWifiRule, ssid: String?, security: String?, address: String?): Int {
        if (rule.ssid != ssid) return -1
        val expected = bssid(rule.bssid)
        if (!rule.bssid.isNullOrBlank() && (expected.isEmpty() || expected != bssid(address))) return -1
        val type = normalize(rule.security)
        if (type.isNotEmpty() && !matches(type, normalize(security)) && !(expected.isNotEmpty() && normalize(security).isEmpty())) return -1
        return if (expected.isNotEmpty()) 3 else if (type.isNotEmpty()) 2 else 1
    }
}
