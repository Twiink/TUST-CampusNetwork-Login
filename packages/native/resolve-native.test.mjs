import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveNativeRequest } from './resolve-native.cjs';

test('maps supported desktop platforms to napi binary targets', () => {
  assert.deepEqual(resolveNativeRequest('linux', 'x64'), {
    target: 'linux-x64-gnu',
    binary: 'netmate_native.linux-x64-gnu.node',
    request: './linux-x64-gnu/netmate_native.linux-x64-gnu.node',
  });
  assert.deepEqual(resolveNativeRequest('linux', 'arm64'), {
    target: 'linux-arm64-gnu',
    binary: 'netmate_native.linux-arm64-gnu.node',
    request: './linux-arm64-gnu/netmate_native.linux-arm64-gnu.node',
  });
  assert.deepEqual(resolveNativeRequest('darwin', 'arm64'), {
    target: 'darwin-arm64',
    binary: 'netmate_native.darwin-arm64.node',
    request: './darwin-arm64/netmate_native.darwin-arm64.node',
  });
  assert.deepEqual(resolveNativeRequest('darwin', 'x64'), {
    target: 'darwin-x64',
    binary: 'netmate_native.darwin-x64.node',
    request: './darwin-x64/netmate_native.darwin-x64.node',
  });
  assert.deepEqual(resolveNativeRequest('win32', 'x64'), {
    target: 'win32-x64',
    binary: 'netmate_native.win32-x64-msvc.node',
    request: './win32-x64/netmate_native.win32-x64-msvc.node',
  });
});

test('rejects unsupported platform combinations without throwing', () => {
  assert.equal(resolveNativeRequest('freebsd', 'x64').error, 'Unsupported platform: freebsd-x64');
  assert.equal(resolveNativeRequest('win32', 'arm64').error, 'Unsupported platform: win32-arm64');
});
