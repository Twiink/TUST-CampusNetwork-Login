package com.netmate.app.update

/** Metadata policy separated from PackageManager so upgrade rules have JVM regression tests. */
internal object ApkPolicy {
    data class Identity(val packageName: String, val version: Long, val signers: Set<String>, val history: Set<String> = signers)

    fun isInstalled(installed: Identity, candidate: Identity): Boolean =
        candidate.packageName == installed.packageName && candidate.version == installed.version &&
            installed.signers.isNotEmpty() && candidate.signers == installed.signers

    fun validate(installed: Identity, candidate: Identity): String? = when {
        candidate.packageName != installed.packageName -> "APK 包名不匹配"
        candidate.version <= installed.version -> "APK 版本必须高于当前版本"
        installed.signers.isEmpty() || candidate.signers.isEmpty() -> "无法验证 APK 签名"
        installed.signers.size > 1 || candidate.signers.size > 1 ->
            if (installed.signers == candidate.signers) null else "APK 签名不匹配"
        !candidate.history.containsAll(installed.signers) -> "APK 签名不匹配"
        else -> null
    }
}
