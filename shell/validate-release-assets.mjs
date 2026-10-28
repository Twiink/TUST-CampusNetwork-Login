import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export function validateAssets(root, version) {
  function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
    );
  }
  const files = walk(root).filter((file) => !file.endsWith('/SHA256SUMS'));
  const byName = new Map();
  for (const file of files) {
    const name = path.basename(file);
    if (byName.has(name) || statSync(file).size === 0) throw new Error(`重复或空附件: ${name}`);
    byName.set(name, file);
  }
  const required = [
    `NetMate-Windows-${version}-Setup.exe`,
    `NetMate-Windows-${version}-Setup.exe.blockmap`,
    `NetMate-Mac-${version}-Installer.dmg`,
    `NetMate-Mac-${version}-Installer.zip`,
    `NetMate-Mac-${version}-Installer.dmg.blockmap`,
    `NetMate-Mac-${version}-Installer.zip.blockmap`,
    `NetMate-Linux-${version}.AppImage`,
    `NetMate-Linux-${version}.deb`,
    'latest.yml',
    'latest-mac.yml',
    'latest-linux.yml',
  ];
  for (const name of required) if (!byName.has(name)) throw new Error(`缺少附件: ${name}`);
  const apks = [...byName.keys()].filter((name) => name.endsWith('.apk'));
  if (
    apks.length !== 5 ||
    ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86', 'universal'].some(
      (abi) => !apks.some((name) => name.includes(`-${abi}-`))
    )
  )
    throw new Error('缺少 Android 通用或 ABI 安装包');
  for (const name of ['latest.yml', 'latest-mac.yml', 'latest-linux.yml']) {
    const text = readFileSync(byName.get(name), 'utf8');
    if (!new RegExp(`^version: ['"]?${version.replaceAll('.', '\\.')}['"]?$`, 'm').test(text))
      throw new Error(`${name} 版本不符`);
    const entries = [...text.matchAll(/- url:\s*([^\r\n]+)\r?\n\s+sha512:\s*([^\r\n]+)/g)];
    if (!entries.length) throw new Error(`${name} 无更新条目`);
    for (const [, raw, hash] of entries) {
      const filename = decodeURIComponent(raw.trim().replace(/^['"]|['"]$/g, ''));
      const file = byName.get(filename);
      if (!file || createHash('sha512').update(readFileSync(file)).digest('base64') !== hash.trim())
        throw new Error(`${name} 更新文件或校验和不符: ${filename}`);
    }
  }
  const manifest =
    [...byName]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([name, file]) =>
          `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${name}`
      )
      .join('\n') + '\n';
  writeFileSync(path.join(root, 'SHA256SUMS'), manifest);
  return [...byName.keys(), 'SHA256SUMS'];
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(validateAssets(process.argv[2], process.argv[3]).join('\n'));
