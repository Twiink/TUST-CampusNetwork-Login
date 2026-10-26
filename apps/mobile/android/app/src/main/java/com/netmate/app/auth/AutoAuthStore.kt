package com.netmate.app.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * 自动认证配置的持久化。
 * 配置中含账号密码，使用 Android Keystore 中不可导出的 AES-256-GCM 密钥加密后写入 SharedPreferences。
 * 最近一次认证结果不含密码，明文保存供 JS 启动时读取。
 */
object AutoAuthStore {

    private const val PREFS = "netmate_auto_auth"
    private const val KEY_PROFILE = "profile"
    private const val KEY_LAST_RESULT = "last_result"
    private const val KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "netmate_auto_auth_key"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val GCM_TAG_BITS = 128

    @Volatile
    private var cachedProfile: AutoAuthProfile? = null

    @Synchronized
    fun saveProfile(context: Context, json: String): AutoAuthProfile {
        // 先解析校验，非法 JSON 不落盘
        val profile = AutoAuthProfile.fromJson(json)
        prefs(context).edit().putString(KEY_PROFILE, encrypt(json)).apply()
        cachedProfile = profile
        return profile
    }

    @Synchronized
    fun loadProfile(context: Context): AutoAuthProfile? {
        cachedProfile?.let { return it }
        val stored = prefs(context).getString(KEY_PROFILE, null) ?: return null
        return try {
            AutoAuthProfile.fromJson(decrypt(stored)).also { cachedProfile = it }
        } catch (e: Exception) {
            // 密钥失效（如系统清除了 Keystore）或数据损坏：丢弃，等待 JS 下次同步
            prefs(context).edit().remove(KEY_PROFILE).apply()
            null
        }
    }

    fun saveLastResult(context: Context, result: AutoAuthResult) {
        prefs(context).edit().putString(KEY_LAST_RESULT, result.toJson().toString()).apply()
    }

    fun loadLastResult(context: Context): AutoAuthResult? {
        val stored = prefs(context).getString(KEY_LAST_RESULT, null) ?: return null
        return try {
            AutoAuthResult.fromJson(JSONObject(stored))
        } catch (e: Exception) {
            null
        }
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val body = Base64.encodeToString(encrypted, Base64.NO_WRAP)
        return "$iv:$body"
    }

    private fun decrypt(stored: String): String {
        val (iv, body) = stored.split(":", limit = 2).also { require(it.size == 2) }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey(),
            GCMParameterSpec(GCM_TAG_BITS, Base64.decode(iv, Base64.NO_WRAP)),
        )
        return String(cipher.doFinal(Base64.decode(body, Base64.NO_WRAP)), Charsets.UTF_8)
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }
}

/** 一次自动认证尝试的结果（不含密码） */
data class AutoAuthResult(
    val success: Boolean,
    val message: String,
    val trigger: String,
    val username: String?,
    val attempts: Int,
    val timestamp: Long,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("success", success)
        .put("message", message)
        .put("trigger", trigger)
        .put("username", username ?: JSONObject.NULL)
        .put("attempts", attempts)
        .put("timestamp", timestamp)

    companion object {
        fun fromJson(json: JSONObject) = AutoAuthResult(
            success = json.getBoolean("success"),
            message = json.getString("message"),
            trigger = json.optString("trigger", ""),
            username = if (json.isNull("username")) null else json.optString("username"),
            attempts = json.optInt("attempts", 0),
            timestamp = json.getLong("timestamp"),
        )
    }
}
