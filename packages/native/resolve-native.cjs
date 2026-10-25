'use strict';

const PLATFORM_TARGETS = {
  linux: {
    x64: 'linux-x64-gnu',
    arm64: 'linux-arm64-gnu',
  },
  darwin: {
    arm64: 'darwin-arm64',
    x64: 'darwin-x64',
  },
  win32: {
    x64: 'win32-x64',
  },
};

const BINARY_NAMES = {
  'linux-x64-gnu': 'netmate_native.linux-x64-gnu.node',
  'linux-arm64-gnu': 'netmate_native.linux-arm64-gnu.node',
  'darwin-arm64': 'netmate_native.darwin-arm64.node',
  'darwin-x64': 'netmate_native.darwin-x64.node',
  'win32-x64': 'netmate_native.win32-x64-msvc.node',
};

function resolveNativeRequest(platform, arch) {
  const target = PLATFORM_TARGETS[platform]?.[arch];
  if (!target) {
    return { error: `Unsupported platform: ${platform}-${arch}` };
  }
  const binary = BINARY_NAMES[target];
  if (!binary) {
    return { error: `Unsupported native target: ${target}` };
  }
  return { target, binary, request: `./${target}/${binary}` };
}

module.exports = { resolveNativeRequest };
