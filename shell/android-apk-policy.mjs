import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function resolvePolicyPath(manifest, resources) {
  if (/android:debuggable[^\n]*0xffffffff/.test(manifest)) throw new Error('正式 APK 启用了调试');
  const id = manifest.match(/android:networkSecurityConfig[^\n]*=@(0x[0-9a-f]+)/i)?.[1];
  if (!id) throw new Error('正式 APK 缺少网络策略引用');
  const lines = resources.split('\n');
  const index = lines.findIndex((line) =>
    new RegExp(`^\\s*resource ${id} .*:xml/network_security_config:`).test(line)
  );
  const file = lines[index + 1]?.match(/\(string(?:8|16)\) "([^"]+)"/)?.[1];
  if (index < 0 || !file || !/^res\/[^\s]+\.xml$/.test(file))
    throw new Error('无法解析正式网络策略的资源路径');
  return file;
}

export function verifyPolicy(xml) {
  const base = xml.match(/^(\s*)E: base-config[^\n]*\n([\s\S]*?)(?=^\1E:|$(?![\s\S]))/m)?.[2];
  if (!base || !/^\s*A: cleartextTrafficPermitted=\(type 0x12\)0xffffffff\s*$/m.test(base))
    throw new Error('正式 APK 的 base-config 未允许自定义 HTTP 门户');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [aapt, apk] = process.argv.slice(2);
  const dump = (...args) =>
    execFileSync(aapt, ['dump', ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const policyPath = resolvePolicyPath(
    dump('xmltree', apk, 'AndroidManifest.xml'),
    dump('--values', 'resources', apk)
  );
  verifyPolicy(dump('xmltree', apk, policyPath));
  console.log(`正式 APK 网络策略通过: ${policyPath}`);
}
