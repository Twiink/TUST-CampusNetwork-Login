package com.netmate.app.update
import org.junit.Assert.*
import org.junit.Test

class ApkPolicyTest {
    private val installed = ApkPolicy.Identity("com.netmate.app", 10014, setOf("release"))
    @Test fun acceptsHigherVersionAndValidSigningLineage() {
        assertNull(ApkPolicy.validate(installed, installed.copy(version = 10020)))
        assertNull(ApkPolicy.validate(installed, installed.copy(version = 10020, signers = setOf("rotated"), history = setOf("release", "rotated"))))
    }
    @Test fun rejectsWrongPackageDowngradeAndUntrustedSignature() {
        assertNotNull(ApkPolicy.validate(installed, installed.copy(packageName = "other", version = 10020)))
        assertNotNull(ApkPolicy.validate(installed, installed.copy(version = 10010)))
        assertNotNull(ApkPolicy.validate(installed, installed.copy(version = 10020, signers = setOf("other"), history = setOf("other"))))
    }
    @Test fun nextReleaseUniversalCodeExceedsPreviousAbiVariants() {
        for (abi in 0..4) assertTrue((1002 * 10) > (1001 * 10 + abi))
    }
    @Test fun completedUpgradeRequiresSamePackageVersionAndSigningIdentity() {
        assertTrue(ApkPolicy.isInstalled(installed, installed.copy()))
        assertFalse(ApkPolicy.isInstalled(installed, installed.copy(version = 10020)))
        assertFalse(ApkPolicy.isInstalled(installed, installed.copy(packageName = "other")))
        assertFalse(ApkPolicy.isInstalled(installed, installed.copy(signers = setOf("untrusted"))))
        assertFalse(ApkPolicy.isInstalled(installed.copy(signers = emptySet()), installed.copy(signers = emptySet())))
    }
    @Test fun missingCertificatesCannotAuthorizeAnUpgrade() {
        val candidate = installed.copy(version = 10020)
        assertEquals("无法验证 APK 签名", ApkPolicy.validate(installed.copy(signers = emptySet()), candidate))
        assertEquals("无法验证 APK 签名", ApkPolicy.validate(installed, candidate.copy(signers = emptySet())))
    }
    @Test fun multipleSignersRequireTheExactCurrentSignerSet() {
        val multiple = installed.copy(signers = setOf("release", "second"))
        assertNull(ApkPolicy.validate(multiple, multiple.copy(version = 10020)))
        val changed = multiple.copy(version = 10020, signers = setOf("release", "other"), history = setOf("release", "second", "other"))
        assertEquals("APK 签名不匹配", ApkPolicy.validate(multiple, changed))
    }
}
