'use strict';

const platform = process.platform;
const arch = process.arch;

function binaryName() {
  if (platform === 'linux' && arch === 'x64') return 'netmate_native.linux-x64-gnu.node';
  if (platform === 'linux' && arch === 'arm64') return 'netmate_native.linux-arm64-gnu.node';
  if (platform === 'darwin' && arch === 'arm64') return 'netmate_native.darwin-arm64.node';
  if (platform === 'darwin' && arch === 'x64') return 'netmate_native.darwin-x64.node';
  if (platform === 'win32' && arch === 'x64') return 'netmate_native.win32-x64-msvc.node';
  return null;
}

const name = binaryName();
if (!name) {
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

module.exports = require(`./linux-x64-gnu/${name}`);
