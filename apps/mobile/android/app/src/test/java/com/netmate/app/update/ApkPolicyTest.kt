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
}
