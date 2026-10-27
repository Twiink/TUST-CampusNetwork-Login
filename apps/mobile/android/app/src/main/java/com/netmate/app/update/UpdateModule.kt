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
import com.facebook.react.bridge.*
import com.netmate.app.BuildConfig
import com.netmate.app.bridge.toNativeMap
import com.netmate.app.logging.NetMateLogs
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

class UpdateModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "NetMateUpdater"
    override fun getConstants(): Map<String, Any> = com.netmate.app.PlatformRuntime.constants
    private var verificationKey: String? = null
    private data class Verification(val error: String? = null, val installed: Boolean = false)
    private var verification = Verification()
    override fun invalidate() { executor.shutdownNow(); super.invalidate() }
    private val downloads get() = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    private val prefs get() = context.getSharedPreferences("netmate_updates", Context.MODE_PRIVATE)
    private val executor = java.util.concurrent.Executors.newSingleThreadExecutor()
    private fun task(promise: Promise, action: () -> Any?) {
        executor.execute { try { promise.resolve(action()) } catch (_: Exception) { promise.reject("UPDATE_FAILED", "更新操作失败，请检查网络或存储后重试") } }
    }

    @ReactMethod fun start(url: String, version: String, promise: Promise) = task(promise) {
        val uri = Uri.parse(url)
        require(uri.scheme == "https" || (BuildConfig.BUILD_TYPE == "e2e" && uri.scheme == "http"))
        require(uri.userInfo == null && !uri.host.isNullOrBlank())
        cancelDownload()
        check(prefs.edit().remove("installedVersionCode").commit())
        val relative = "updates/netmate-${System.currentTimeMillis()}.apk"
        val file = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), relative)
        file.parentFile?.mkdirs()
        val request = DownloadManager.Request(uri)
            .setTitle("NetMate 更新 $version")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, relative)
        val id = downloads.enqueue(request)
        check(prefs.edit().putLong("id", id).putString("file", file.absolutePath).putString("url", url).putString("version", version).commit())
        state().toNativeMap()
    }
    @ReactMethod fun getStatus(promise: Promise) = task(promise) { state().toNativeMap() }
    @ReactMethod fun cancel(promise: Promise) = task(promise) { cancelDownload(); state().toNativeMap() }
    @ReactMethod fun install(promise: Promise) = task(promise) {
        val state = state()
        require(state.optString("state") == "downloaded")
        val file = File(prefs.getString("file", "")!!)
        val checked = verify(file)
        checked.error?.let { throw IllegalArgumentException(it) }
        check(!checked.installed)
        if (Build.VERSION.SDK_INT >= 26 && !context.packageManager.canRequestPackageInstalls()) {
            context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return@task "permission-required"
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
        "installer-opened"
    }
    private fun cancelDownload() {
        verificationKey = null; verification = Verification()
        val id = prefs.getLong("id", -1)
        if (id >= 0) downloads.remove(id)
        prefs.getString("file", null)?.let { File(it).delete() }
        prefs.edit().remove("id").remove("file").commit()
    }
    private fun state(): JSONObject {
        val result = JSONObject().put("state", "idle").put("progress", 0).put("version", prefs.getString("version", null) ?: JSONObject.NULL)
            .put("installAllowed", Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls())
        if (prefs.getInt("installedVersionCode", -1) == BuildConfig.VERSION_CODE) result.put("message", "更新已安装")
        val id = prefs.getLong("id", -1)
        if (id < 0) return result
        downloads.query(DownloadManager.Query().setFilterById(id)).use { cursor ->
            if (!cursor.moveToFirst()) return result.put("state", "failed").put("error", "下载记录已失效，请重试")
            val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            val received = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
            val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
            result.put("progress", if (total > 0) ((received * 100 / total).coerceIn(0, 100)) else 0)
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
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
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
        val signers = if (Build.VERSION.SDK_INT >= 28) hashes(info.signingInfo?.apkContentsSigners) else hashes(info.signatures)
        val history = if (Build.VERSION.SDK_INT >= 28 && info.signingInfo?.hasMultipleSigners() == false) hashes(info.signingInfo?.signingCertificateHistory) else signers
        return ApkPolicy.Identity(info.packageName, if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong(), signers, history)
    }
}
