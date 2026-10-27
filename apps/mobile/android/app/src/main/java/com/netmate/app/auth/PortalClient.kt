package com.netmate.app.auth

import android.net.Network
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * 校园网认证门户客户端（原生后台使用）。
 *
 * 协议完全对齐参考实现 tust-portal-cli/internal/portal/client.go 与
 * packages/shared/src/services/auth-protocol.ts：
 * - GET http://10.10.102.50:801/eportal/portal/login，参数固定
 * - 联通账号追加 @unicom 后缀，校园网账号原样发送
 * - 响应含 "status":1 或 "已经在线" 即成功
 * - 失败最多尝试 3 次、间隔 2 秒
 *
 * 所有请求都绑定到指定的 WiFi Network：未认证时系统会把 WiFi 标为无法上网，
 * 默认路由可能走移动数据，导致访问不到 10.x 门户或拿到移动网络的 204 误判在线。
 */
class PortalClient(
    private val transport: Transport = UrlConnectionTransport(),
    private val sleeper: (Long) -> Unit = { Thread.sleep(it) },
) {

    companion object {
        const val DEFAULT_SERVER_URL = "http://10.10.102.50:801"
        const val USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
        const val MAX_ATTEMPTS = 3
        const val RETRY_DELAY_MS = 2000L
        const val REQUEST_TIMEOUT_MS = 10_000
        const val PROBE_TIMEOUT_MS = 3_000

        /** 与 packages/shared/src/constants/defaults.ts 的 DEFAULT_CONNECTIVITY_CHECK_URLS 保持一致 */
        val CONNECTIVITY_CHECK_URLS = listOf(
            "http://connectivitycheck.platform.hicloud.com/generate_204",
            "http://connect.rom.miui.com/generate_204",
            "http://www.google.cn/generate_204",
        )

        private val STATUS_SUCCESS = Regex("\"status\"\\s*:\\s*1")

        fun buildUserAccount(username: String, isp: String): String {
            // 学校只提供校园网与中国联通；其他取值按校园网处理（无后缀），与参考实现一致
            val suffix = when (isp) { "cucc" -> "@unicom"; "cmcc" -> "@cmcc"; "ctcc" -> "@telecom"; else -> "" }
            return ",0,$username$suffix"
        }

        fun buildLoginUrl(
            serverUrl: String,
            username: String,
            password: String,
            isp: String,
            ipv4: String,
            ipv6: String?,
        ): String {
            val params = linkedMapOf(
                "callback" to "dr1005",
                "login_method" to "1",
                "user_account" to buildUserAccount(username, isp),
                "user_password" to password,
                "wlan_user_ip" to ipv4,
                "wlan_user_mac" to "000000000000",
                "jsVersion" to "4.1.3",
                "terminal_type" to "3",
                "lang" to "zh-cn",
                "v" to "9303",
            )
            if (!ipv6.isNullOrBlank()) params["wlan_user_ipv6"] = ipv6
            val query = params.entries.joinToString("&") { (key, value) -> "$key=${encode(value)}" }
            return "${serverUrl.trimEnd('/')}/eportal/portal/login?$query"
        }

        fun isLoginSuccess(body: String): Boolean =
            STATUS_SUCCESS.containsMatchIn(body) || body.contains("已经在线")

        /** application/x-www-form-urlencoded 会把空格编码为 +，门户按 %20 解析，与 JS encodeURIComponent 对齐 */
        private fun encode(value: String): String =
            URLEncoder.encode(value, "UTF-8").replace("+", "%20").replace("*", "%2A").replace("%7E", "~")
    }

    data class Credentials(
        val username: String,
        val password: String,
        val isp: String,
        val serverUrl: String,
    )

    data class LoginOutcome(val success: Boolean, val message: String, val attempts: Int)

    interface Transport {
        /** 返回 (状态码, 响应体)；网络错误抛 IOException */
        @Throws(IOException::class)
        fun get(url: String, network: Network?, timeoutMs: Int, readBody: Boolean): Pair<Int, String>
    }

    /**
     * 检查 WiFi 网络是否已能访问外网：任一探测点返回严格 204 即视为已认证。
     * 未认证时门户会劫持为 200 页面，因此不能只看 2xx。
     */
    fun isOnline(network: Network?): Boolean {
        return CONNECTIVITY_CHECK_URLS.any { url ->
            try {
                transport.get(url, network, PROBE_TIMEOUT_MS, readBody = false).first == 204
            } catch (e: IOException) {
                false
            }
        }
    }

    fun login(credentials: Credentials, ipv4: String, ipv6: String?, network: Network?, shouldContinue: () -> Boolean = { true }): LoginOutcome {
        val url = buildLoginUrl(
            credentials.serverUrl.ifBlank { DEFAULT_SERVER_URL },
            credentials.username,
            credentials.password,
            credentials.isp,
            ipv4,
            ipv6,
        )

        var lastMessage = "登录失败"
        for (attempt in 1..MAX_ATTEMPTS) {
            if (!shouldContinue()) return LoginOutcome(false, "认证已取消", attempt - 1)
            try {
                val (_, body) = transport.get(url, network, REQUEST_TIMEOUT_MS, readBody = true)
                if (isLoginSuccess(body)) {
                    val message = if (body.contains("已经在线")) "账号已在线" else "登录成功"
                    return LoginOutcome(true, message, attempt)
                }
                lastMessage = extractMessage(body) ?: "登录失败: 响应中未找到成功标志"
            } catch (e: IOException) {
                lastMessage = "登录请求失败，请检查 WiFi 连接"
            }
            if (attempt < MAX_ATTEMPTS) {
                sleeper(RETRY_DELAY_MS)
            }
        }
        return LoginOutcome(false, lastMessage, MAX_ATTEMPTS)
    }

    fun logout(serverUrl: String, network: Network?): LoginOutcome {
        return try {
            val (code, body) = transport.get("${serverUrl.trimEnd('/')}/eportal/portal/logout", network, REQUEST_TIMEOUT_MS, true)
            val success = code in 200..299 && Regex("\"result\"\\s*:\\s*1").containsMatchIn(body)
            LoginOutcome(success, if (success) "注销成功" else "注销失败，请重试", 1)
        } catch (_: IOException) { LoginOutcome(false, "注销请求失败，请检查 WiFi 连接", 1) }
    }

    /** 从 JSONP 响应中提取 msg 字段，仅用于提示，不参与成功判定 */
    private fun extractMessage(body: String): String? {
        val match = Regex("\"msg\"\\s*:\\s*\"([^\"]*)\"").find(body) ?: return null
        return match.groupValues[1].takeIf { it.isNotBlank() }
    }
}

/** 基于 HttpURLConnection 的实现；network 非空时通过 Network.openConnection 绑定 WiFi */
class UrlConnectionTransport : PortalClient.Transport {
    override fun get(url: String, network: Network?, timeoutMs: Int, readBody: Boolean): Pair<Int, String> {
        val target = URL(url)
        val connection = (network?.openConnection(target) ?: target.openConnection()) as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.connectTimeout = timeoutMs
            connection.readTimeout = timeoutMs
            connection.instanceFollowRedirects = false
            connection.useCaches = false
            connection.setRequestProperty("User-Agent", PortalClient.USER_AGENT)

            val code = connection.responseCode
            if (!readBody) {
                return Pair(code, "")
            }
            val stream = if (code >= 400) connection.errorStream else connection.inputStream
            val body = stream?.bufferedReader(Charsets.UTF_8)?.use { reader ->
                // 门户响应很短；限制读取长度，避免异常页面占用内存
                val buffer = CharArray(8192)
                val read = reader.read(buffer)
                if (read > 0) String(buffer, 0, read) else ""
            } ?: ""
            return Pair(code, body)
        } finally {
            connection.disconnect()
        }
    }
}
