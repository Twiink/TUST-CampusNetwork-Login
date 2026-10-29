package com.netmate.app.update

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import com.netmate.app.BuildConfig
import com.netmate.app.logging.NetMateLogs
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

internal class NativeUpdater(private val context: Context) {
    private var verificationKey: String? = null
    private data class Verification(val error: String? = null, val installed: Boolean = false)
    private var verification = Verification()
    private val downloads get() = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    private val prefs get() = context.getSharedPreferences("netmate_native_updates", Context.MODE_PRIVATE)
    @Volatile private var release: JSONObject? = null
    fun check(): JSONObject? {
        require(BuildConfig.UPDATE_ENDPOINT.startsWith("https://") && BuildConfig.UPDATE_PUBLIC_KEY.isNotBlank()) { "此构建尚未配置签名更新源" }
        val connection = java.net.URL(BuildConfig.UPDATE_ENDPOINT).openConnection() as java.net.HttpURLConnection
        val text = try { connection.connectTimeout = 10000; connection.readTimeout = 15000; connection.inputStream.use { String(it.readNBytes(65537)).also { s -> require(s.length <= 65536) } } } finally { connection.disconnect() }
        val items = org.json.JSONArray(text)
        release = (0 until items.length()).map(items::getJSONObject).filter { it.optString("platform") == "android" && version(it.getString("version")) > version(BuildConfig.VERSION_NAME) }.maxByOrNull { version(it.getString("version")) }
        release?.let(::verifyManifest)
        return release
    }
    private fun version(s: String): Long { val p=s.removePrefix("v").split('.').map(String::toLong); require(p.size==3); return p[0]*1000000+p[1]*1000+p[2] }
    private fun verifyManifest(r: JSONObject) {
        val url=Uri.parse(r.getString("url")); require(url.scheme=="https" && url.userInfo==null)
        require(r.getLong("length") in 1..5L*1024*1024 && r.getString("arch")=="universal")
        val raw=android.util.Base64.decode(BuildConfig.UPDATE_PUBLIC_KEY,android.util.Base64.DEFAULT)
        val prefix=byteArrayOf(0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0x00)
        val key=java.security.KeyFactory.getInstance("Ed25519").generatePublic(java.security.spec.X509EncodedKeySpec(if(raw.size==32)prefix+raw else raw))
        val signature=java.security.Signature.getInstance("Ed25519");signature.initVerify(key)
        signature.update(listOf("version","platform","arch","url","length","sha256").joinToString("\n"){r.get(it).toString()}.toByteArray())
        require(signature.verify(android.util.Base64.decode(r.getString("signature"),android.util.Base64.DEFAULT))) { "更新元数据签名无效" }
    }
    fun start(): JSONObject {
        val r=release ?: error("请先检查更新"); verifyManifest(r); cancelDownload()
        val relative="updates/netmate-${System.currentTimeMillis()}.apk"
        val file=File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),relative);file.parentFile?.mkdirs()
        val id=downloads.enqueue(DownloadManager.Request(Uri.parse(r.getString("url"))).setTitle("NetMate ${r.getString("version")}").setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED).setDestinationInExternalFilesDir(context,Environment.DIRECTORY_DOWNLOADS,relative))
        check(prefs.edit().putLong("id",id).putString("file",file.absolutePath).putString("version",r.getString("version")).putString("release",r.toString()).commit());return state()
    }
    fun cancel(): JSONObject { cancelDownload();return state() }
    fun install(): JSONObject {
        require(state().getString("state")=="downloaded") { "下载尚未完成" }
        val r=JSONObject(prefs.getString("release",null) ?: error("更新元数据丢失"));verifyManifest(r)
        val file=File(prefs.getString("file","")!!); require(file.length()==r.getLong("length")){"更新文件长度不匹配"}
        val hash=MessageDigest.getInstance("SHA-256");file.inputStream().use { input -> val b=ByteArray(32768);while(true){val n=input.read(b);if(n<0)break;hash.update(b,0,n)} }
        require(hash.digest().joinToString(""){"%02x".format(it)}==r.getString("sha256")){"更新摘要不匹配"}
        verify(file).error?.let { error(it) }
        if(!context.packageManager.canRequestPackageInstalls()){context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));return JSONObject().put("state","permission-required")}
        val uri=FileProvider.getUriForFile(context,"${context.packageName}.files",file)
        context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
        return JSONObject().put("state","installer-opened")
    }
    private fun cancelDownload() {
        verificationKey = null; verification = Verification()
        val id = prefs.getLong("id", -1)
        if (id >= 0) downloads.remove(id)
        prefs.getString("file", null)?.let { File(it).delete() }
        prefs.edit().remove("id").remove("file").commit()
    }
    fun state(): JSONObject {
        val result = JSONObject().put("state", "idle").put("progress", 0).put("version", prefs.getString("version", null) ?: JSONObject.NULL)
            .put("installAllowed", context.packageManager.canRequestPackageInstalls())
        if (prefs.getInt("installedVersionCode", -1) == BuildConfig.VERSION_CODE) result.put("message", "更新已安装")
        val id = prefs.getLong("id", -1)
        if (id < 0) return result
        downloads.query(DownloadManager.Query().setFilterById(id)).use { cursor ->
            if (!cursor.moveToFirst()) return result.put("state", "failed").put("error", "下载记录已失效，请重试")
            val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            val received = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
            val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
            result.put("received",received).put("total",total).put("progress", if (total > 0) ((received * 100 / total).coerceIn(0, 100)) else 0)
            when (status) {
                DownloadManager.STATUS_SUCCESSFUL -> {
                    val file = File(prefs.getString("file", "")!!)
                    val key = "$id:${file.length()}:${file.lastModified()}"
                    if (verificationKey != key) {
                        verification = verify(file)
                        verificationKey = key
                    }
                    val checked = verification
                    if (checked.installed) {
                        cancelDownload()
                        check(prefs.edit().putInt("installedVersionCode", BuildConfig.VERSION_CODE).commit())
                        result.put("state", "idle").put("progress", 0).put("message", "更新已安装")
                    }
                    else if (checked.error != null) result.put("state", "failed").put("error", checked.error)
                    else result.put("state", "downloaded").put("progress", 100)
                }
                DownloadManager.STATUS_FAILED -> result.put("state", "failed").put("error", "下载失败，请重试")
                DownloadManager.STATUS_PAUSED -> result.put("state", "downloading").put("message", "等待网络恢复")
                else -> result.put("state", "downloading")
            }
        }
        return result
    }
    @Suppress("DEPRECATION")
    private fun verify(file: File): Verification {
        if (!file.isFile) return Verification("下载文件不存在，请重试")
        val flags = PackageManager.GET_SIGNING_CERTIFICATES
        val candidate = context.packageManager.getPackageArchiveInfo(file.absolutePath, flags) ?: return Verification("APK 文件无效")
        val expected = prefs.getString("version", null)?.removePrefix("v")
        if (expected != null && candidate.versionName?.substringBefore('-') != expected) return Verification("APK 版本与更新信息不匹配")
        val installed = context.packageManager.getPackageInfo(context.packageName, flags)
        if (ApkPolicy.isInstalled(identity(installed), identity(candidate))) return Verification(installed = true)
        val error = ApkPolicy.validate(identity(installed), identity(candidate))
        if (error != null) NetMateLogs.log(context, "warn", error, "update")
        return Verification(error)
    }
    @Suppress("DEPRECATION")
    private fun identity(info: PackageInfo): ApkPolicy.Identity {
        fun hashes(signatures: Array<android.content.pm.Signature>?): Set<String> = signatures?.map { signature ->
            MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it) }
        }?.toSet() ?: emptySet()
        val signers = hashes(info.signingInfo?.apkContentsSigners)
        val history = if (info.signingInfo?.hasMultipleSigners() == false) hashes(info.signingInfo?.signingCertificateHistory) else signers
        return ApkPolicy.Identity(info.packageName, info.longVersionCode, signers, history)
    }
}
