import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElectronLaunchOptions } from '../e2e/launchOptions';

describe('createElectronLaunchOptions', () => {
  it('当运行在 Linux CI 时应附加无沙箱启动参数', () => {
    const options = createElectronLaunchOptions('/tmp/netmate/e2e', 'linux', {
      CI: 'true',
    });

    expect(options.args).toEqual([
      '--no-sandbox',
      '--disable-dev-shm-usage',
      path.join('/tmp/netmate/e2e', 'electron-main.mjs'),
    ]);
    expect(options.cwd).toBe(path.join('/tmp/netmate/e2e', '..'));
    expect(options.env.NETMATE_E2E).toBe('1');
    expect(options.env.ELECTRON_DISABLE_SANDBOX).toBe('1');
  });

  it('当不是 Linux 且未处于 CI 时不应附加无沙箱参数', () => {
    const options = createElectronLaunchOptions('/tmp/netmate/e2e', 'darwin', {});

    expect(options.args).toEqual([path.join('/tmp/netmate/e2e', 'electron-main.mjs')]);
    expect(options.env.NETMATE_E2E).toBe('1');
    expect(options.env.ELECTRON_DISABLE_SANDBOX).toBeUndefined();
  });
});
