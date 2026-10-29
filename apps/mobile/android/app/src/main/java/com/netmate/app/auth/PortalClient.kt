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
    private val probeUrls: List<String> = CONNECTIVITY_CHECK_URLS,
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

        private val probes = java.util.concurrent.ThreadPoolExecutor(3,3,15,java.util.concurrent.TimeUnit.SECONDS,java.util.concurrent.ArrayBlockingQueue<Runnable>(12),java.util.concurrent.ThreadFactory { task -> Thread(task,"netmate-probe").apply { isDaemon=true } }).apply { allowCoreThreadTimeOut(true) }
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
        val native=transport as? UrlConnectionTransport
        if (native==null) return probeUrls.any { url -> try { transport.get(url,network,PROBE_TIMEOUT_MS,false).first==204 } catch (_:IOException) { false } }
        val scope=ProbeScope()
        val completed=java.util.concurrent.ExecutorCompletionService<Boolean>(probes)
        val jobs=mutableListOf<java.util.concurrent.Future<Boolean>>()
        try {
            for(url in probeUrls) jobs.add(completed.submit(java.util.concurrent.Callable {
                try { native.getCancellable(url,network,PROBE_TIMEOUT_MS,false,scope).first==204 } catch (_:IOException) { false }
            }))
            val deadline=System.nanoTime()+java.util.concurrent.TimeUnit.MILLISECONDS.toNanos((PROBE_TIMEOUT_MS+500).toLong())
            repeat(jobs.size) {
                val remaining=deadline-System.nanoTime();if(remaining<=0)return false
                val result=completed.poll(remaining,java.util.concurrent.TimeUnit.NANOSECONDS) ?: return false
                if(runCatching{result.get()}.getOrDefault(false))return true
            }
            return false
        } catch (_:java.util.concurrent.RejectedExecutionException) { return false }
        finally { scope.cancel();jobs.forEach{it.cancel(true)} }
    }

    fun login(credentials: Credentials, ipv4: String, ipv6: String?, network: Network?, shouldContinue: () -> Boolean = { true }, maxAttempts: Int = MAX_ATTEMPTS): LoginOutcome {
        val url = buildLoginUrl(
            credentials.serverUrl.ifBlank { DEFAULT_SERVER_URL },
            credentials.username,
            credentials.password,
            credentials.isp,
            ipv4,
            ipv6,
        )

        var lastMessage = "登录失败"
        for (attempt in 1..maxAttempts) {
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
            if (attempt < maxAttempts) {
                sleeper(RETRY_DELAY_MS)
            }
        }
        return LoginOutcome(false, lastMessage, maxAttempts)
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
        return request(url,network,timeoutMs,readBody,null)
    }
    internal fun getCancellable(url:String,network:Network?,timeoutMs:Int,readBody:Boolean,scope:ProbeScope):Pair<Int,String> = request(url,network,timeoutMs,readBody,scope)
    private fun request(url:String,network:Network?,timeoutMs:Int,readBody:Boolean,scope:ProbeScope?):Pair<Int,String> {
        val target = URL(url)
        val connection = (network?.openConnection(target) ?: target.openConnection()) as HttpURLConnection
        try {
            scope?.attach(connection)
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
                val result = StringBuilder()
                while (true) {
                    val read = reader.read(buffer, 0, minOf(buffer.size, 8193 - result.length))
                    if (read < 0) break
                    result.append(buffer, 0, read)
                    if (result.length > 8192) throw IOException("门户响应超过 8192 字符")
                }
                result.toString()
            } ?: ""
            return Pair(code, body)
        } finally {
            scope?.detach(connection)
            connection.disconnect()
        }
    }
}

/** Disconnect outstanding socket reads as soon as any probe returns a valid 204. */
internal class ProbeScope {
    private val cancelled=java.util.concurrent.atomic.AtomicBoolean()
    private val active=java.util.concurrent.ConcurrentHashMap.newKeySet<HttpURLConnection>()
    fun attach(connection:HttpURLConnection) { active.add(connection);if(cancelled.get()){connection.disconnect();throw IOException("Probe cancelled")} }
    fun detach(connection:HttpURLConnection) { active.remove(connection) }
    fun cancel() { cancelled.set(true);active.forEach{it.disconnect()} }
}
