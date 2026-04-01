/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const installScriptPath = require.resolve('electron/install.js');
const electronPackageRoot = path.dirname(installScriptPath);
const electronBinaryPath = path.join(
  electronPackageRoot,
  'dist',
  'Electron.app',
  'Contents',
  'MacOS',
  'Electron'
);

if (fs.existsSync(electronBinaryPath)) {
  console.log('[ensure-electron-binary] Electron 二进制已存在，跳过下载');
  process.exit(0);
}

console.log('[ensure-electron-binary] 检测到 Electron 二进制缺失，开始补装');

const result = spawnSync(process.execPath, [installScriptPath], {
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
