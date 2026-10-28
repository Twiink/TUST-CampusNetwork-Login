import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePolicyPath, verifyPolicy } from './android-apk-policy.mjs';

test('release APK policy resolves the manifest resource ID after resource path optimization', () => {
  const manifest = '  A: android:networkSecurityConfig(0x01010527)=@0x7f110000\n';
  const resources = `spec resource 0x7f110000 com.netmate.app:xml/network_security_config: flags=0x00000000
  resource 0x7f110000 com.netmate.app:xml/network_security_config: t=0x03
    (string8) "res/8G.xml"
`;
  assert.equal(resolvePolicyPath(manifest, resources), 'res/8G.xml');
  assert.throws(() => resolvePolicyPath(manifest, ''), /资源路径/);
  assert.throws(
    () => resolvePolicyPath(manifest + ' A: android:debuggable=(type 0x12)0xffffffff', resources),
    /调试/
  );
});

test('a permissive domain override cannot hide a blocked production base policy', () => {
  const allowed = `E: network-security-config
  E: base-config
    A: cleartextTrafficPermitted=(type 0x12)0xffffffff
`;
  verifyPolicy(allowed);
  assert.throws(
    () =>
      verifyPolicy(`E: network-security-config
  E: base-config
    A: cleartextTrafficPermitted=(type 0x12)0x0
  E: domain-config
    A: cleartextTrafficPermitted=(type 0x12)0xffffffff
`),
    /base-config/
  );
  assert.throws(() => verifyPolicy(''), /base-config/);
});
