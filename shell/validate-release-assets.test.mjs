import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateAssets } from './validate-release-assets.mjs';
test('发布附件要求四平台、ABI、版本与真实更新文件校验和一致', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'netmate-assets-'));
  const version = '1.0.2';
  const files = [
    `NetMate-Windows-${version}-Setup.exe`,
    `NetMate-Windows-${version}-Setup.exe.blockmap`,
    ...['dmg', 'zip', 'dmg.blockmap', 'zip.blockmap'].map(
      (ext) => `NetMate-Mac-${version}-Installer.${ext}`
    ),
    ...['deb', 'AppImage'].map((ext) => `NetMate-Linux-${version}.${ext}`),
    ...['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86', 'universal'].map(
      (abi) => `app-${abi}-release.apk`
    ),
  ];
  try {
    for (const file of files) writeFileSync(path.join(directory, file), 'fixture-' + file);
    for (const [yaml, file] of [
      ['latest.yml', files[0]],
      ['latest-mac.yml', files[3]],
      ['latest-linux.yml', files[7]],
    ]) {
      const sha512 = createHash('sha512')
        .update(readFileSync(path.join(directory, file)))
        .digest('base64');
      writeFileSync(
        path.join(directory, yaml),
        `version: ${version}\nfiles:\n  - url: ${file}\n    sha512: ${sha512}\n`
      );
    }
    assert.equal(validateAssets(directory, version).length, 17);
    assert.throws(() => validateAssets(directory, '1.0.3'));
    writeFileSync(path.join(directory, files[0]), 'tampered');
    assert.throws(() => validateAssets(directory, version));
    unlinkSync(path.join(directory, files.at(-1)));
    assert.throws(() => validateAssets(directory, version));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
