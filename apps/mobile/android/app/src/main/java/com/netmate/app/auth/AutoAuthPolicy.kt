package com.netmate.app.auth

/**
 * 自动认证判定（纯函数，便于单元测试）。
 *
 * 与桌面端保持一致：
 * - 需要认证判定对齐 WifiManager.resolveAuthRequirement：已配置的 WiFi 以用户配置为准，
 *   未配置的 WiFi 退回校园网启发式（SSID 前缀 TUST/CU_TUST 且 IPv4 为 10.x）
 * - 账号选择对齐 AutoReconnectService.attemptReconnect：优先 WiFi 关联账号序列，
 *   关联账号不存在时回退到当前账号
 *
 * 后台拿不到 SSID 时（Android 10+ 后台读取 SSID 需要后台定位权限），
 * 仅当 IPv4 为 10.x 且系统已检测到强制门户（NET_CAPABILITY_CAPTIVE_PORTAL）时才认证，并只使用当前账号。
 */
object AutoAuthPolicy {

    private val CAMPUS_SSID_PREFIXES = listOf("TUST", "CU_TUST")

    data class Decision(
        val requiresAuth: Boolean,
        val accounts: List<AutoAuthAccount>,
        val reason: String,
    )

    fun isCampusNetwork(ssid: String?, ipv4: String?): Boolean {
        if (ssid.isNullOrEmpty() || ipv4.isNullOrEmpty()) return false
        val normalized = ssid.uppercase()
        return CAMPUS_SSID_PREFIXES.any { normalized.startsWith(it) } && ipv4.startsWith("10.")
    }

    fun decide(profile: AutoAuthProfile, ssid: String?, ipv4: String?, captivePortal: Boolean, security: String? = null, bssid: String? = null): Decision {
        if (!profile.enabled || profile.authPaused) {
            return Decision(false, emptyList(), "自动认证已关闭")
        }
        if (ipv4.isNullOrEmpty()) {
            return Decision(false, emptyList(), "未获取到 IPv4 地址")
        }

        val currentAccount = profile.accounts.firstOrNull { it.id == profile.currentAccountId }

        if (ssid.isNullOrEmpty()) {
            val requiresAuth = ipv4.startsWith("10.") && captivePortal
            return Decision(
                requiresAuth,
                listOfNotNull(currentAccount),
                if (requiresAuth) "SSID 不可用，按强制门户 + 10.x 判定" else "SSID 不可用且未检测到校园网门户",
            )
        }

        val rule = profile.wifiRules.filter { WifiSecurity.match(it, ssid, security, bssid) > 0 }
            .sortedWith(compareByDescending<AutoAuthWifiRule> { WifiSecurity.match(it, ssid, security, bssid) }.thenBy { it.priority }).firstOrNull()
        val unresolved = profile.wifiRules.any { it.ssid == ssid &&
            (if (!it.bssid.isNullOrBlank()) 3 else if (!it.security.isNullOrBlank()) 2 else 1) > (rule?.let { WifiSecurity.match(it, ssid, security, bssid) } ?: 0) &&
            (WifiSecurity.normalize(it.security).isEmpty() || WifiSecurity.normalize(security).isEmpty() || WifiSecurity.matches(WifiSecurity.normalize(it.security), WifiSecurity.normalize(security))) &&
            (it.bssid.isNullOrBlank() || WifiSecurity.bssid(bssid).isEmpty() || WifiSecurity.bssid(it.bssid) == WifiSecurity.bssid(bssid)) &&
            ((!it.bssid.isNullOrBlank() && WifiSecurity.bssid(bssid).isEmpty()) || (!it.security.isNullOrBlank() && WifiSecurity.normalize(security).isEmpty() && WifiSecurity.bssid(it.bssid).isEmpty())) }
        if (unresolved) return Decision(false, emptyList(), "WiFi 身份信息不足，请选择安全类型或 BSSID")
        if (rule == null && profile.wifiRules.any { it.ssid == ssid }) return Decision(false, emptyList(), "同名 WiFi 无匹配规则，请确认安全类型或 BSSID")
        if (rule != null) {
            if (!rule.requiresAuth) {
                return Decision(false, emptyList(), "WiFi \"$ssid\" 配置为无需认证")
            }
            val linked = rule.linkedAccountIds.mapNotNull { id -> profile.accounts.firstOrNull { it.id == id } }
            val accounts = linked.ifEmpty { listOfNotNull(currentAccount) }
            return Decision(true, accounts, "WiFi \"$ssid\" 配置为需要认证")
        }

        return if (isCampusNetwork(ssid, ipv4)) {
            Decision(true, listOfNotNull(currentAccount), "未配置 WiFi，按校园网 SSID 判定")
        } else {
            Decision(false, emptyList(), "WiFi \"$ssid\" 不是校园网")
        }
    }
}
