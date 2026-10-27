package com.netmate.app.auth

import org.json.JSONArray
import org.json.JSONObject

/**
 * JS 同步给原生层的自动认证配置快照（由 AppContext 根据 AppConfig 生成）。
 * 原生后台无法运行 JS，因此认证、WiFi 重连与通知所需的配置在这里保留一份，
 * 落盘时由 [AutoAuthStore] 使用 Android Keystore 加密。
 * 新增字段都有默认值，旧版本同步的 JSON 仍可解析。
 */
data class AutoAuthAccount(
    val id: String,
    val username: String,
    val password: String,
    val isp: String,
    val serverUrl: String,
)

data class AutoAuthWifiRule(
    val ssid: String,
    val requiresAuth: Boolean,
    val linkedAccountIds: List<String>,
    /** 以下用于 WiFi 自动重连 */
    val password: String = "",
    val autoConnect: Boolean = false,
    /** 数字越小优先级越高 */
    val priority: Int = 10,
)

/** 对应 AppSettings.notificationSettings 的四个场景开关 */
data class NotificationFlags(
    val wifiDisconnected: Boolean = true,
    val reconnectSuccess: Boolean = true,
    val reconnectFailed: Boolean = true,
    val authRecovered: Boolean = true,
)

data class AutoAuthProfile(
    /** settings.autoReconnect：断线自动重连总开关（校园网认证 + WiFi 重连） */
    val enabled: Boolean,
    val currentAccountId: String?,
    val accounts: List<AutoAuthAccount>,
    val wifiRules: List<AutoAuthWifiRule>,
    /** settings.enableHeartbeat：是否按间隔定时检测（关闭后只由网络事件触发） */
    val heartbeatEnabled: Boolean = true,
    /** settings.heartbeatFailureThreshold：已在线后连续检测失败多少次才判定掉线 */
    val failureThreshold: Int = 3,
    /** settings.wifiReconnectRetries */
    val wifiRetries: Int = 3,
    /** settings.wifiReconnectCooldownMinutes */
    val wifiCooldownMinutes: Int = 5,
    /** settings.startupAutoConnect */
    val startupAutoConnect: Boolean = false,
    /** settings.keepCurrentConnection */
    val keepCurrentConnection: Boolean = true,
    val notifications: NotificationFlags = NotificationFlags(),
    val revision: Long = 0,
    val authPaused: Boolean = false,
) {
    /** 开启了自动连接的 WiFi（WiFi 重连与启动连接的候选） */
    val autoConnectWifis: List<AutoAuthWifiRule>
        get() = wifiRules.filter { it.autoConnect }

    companion object {
        fun fromJson(json: String): AutoAuthProfile {
            val root = JSONObject(json)
            val accounts = root.optJSONArray("accounts").objects().map { item ->
                AutoAuthAccount(
                    id = item.getString("id"),
                    username = item.getString("username"),
                    password = item.getString("password"),
                    isp = item.optString("isp", "campus"),
                    serverUrl = item.optString("serverUrl", ""),
                )
            }
            val wifiRules = root.optJSONArray("wifiRules").objects().map { item ->
                AutoAuthWifiRule(
                    ssid = item.getString("ssid"),
                    requiresAuth = item.optBoolean("requiresAuth", false),
                    linkedAccountIds = item.optJSONArray("linkedAccountIds").strings(),
                    password = item.optString("password", ""),
                    autoConnect = item.optBoolean("autoConnect", false),
                    priority = item.optInt("priority", 10),
                )
            }
            val currentAccountId = if (root.isNull("currentAccountId")) null else root.optString("currentAccountId")
            val notifications = root.optJSONObject("notifications")?.let { item ->
                NotificationFlags(
                    wifiDisconnected = item.optBoolean("wifiDisconnected", true),
                    reconnectSuccess = item.optBoolean("reconnectSuccess", true),
                    reconnectFailed = item.optBoolean("reconnectFailed", true),
                    authRecovered = item.optBoolean("authRecovered", true),
                )
            } ?: NotificationFlags()
            return AutoAuthProfile(
                enabled = root.optBoolean("enabled", false),
                revision = root.optLong("revision", 0),
                authPaused = root.optBoolean("authPaused", false),
                currentAccountId = currentAccountId?.takeIf { it.isNotEmpty() },
                accounts = accounts,
                wifiRules = wifiRules,
                heartbeatEnabled = root.optBoolean("heartbeatEnabled", true),
                failureThreshold = root.optInt("failureThreshold", 3).coerceAtLeast(1),
                wifiRetries = root.optInt("wifiRetries", 3).coerceAtLeast(1),
                wifiCooldownMinutes = root.optInt("wifiCooldownMinutes", 5).coerceAtLeast(0),
                startupAutoConnect = root.optBoolean("startupAutoConnect", false),
                keepCurrentConnection = root.optBoolean("keepCurrentConnection", true),
                notifications = notifications,
            )
        }

        private fun JSONArray?.objects(): List<JSONObject> =
            if (this == null) emptyList() else (0 until length()).map { getJSONObject(it) }

        private fun JSONArray?.strings(): List<String> =
            if (this == null) emptyList() else (0 until length()).map { getString(it) }
    }
}
