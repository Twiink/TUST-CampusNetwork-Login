import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElectronLaunchOptions } from '../e2e/launchOptions';

describe('createElectronLaunchOptions', () => {
  it('当运行在 Linux CI 时应附加无沙箱启动参数', () => {
    const options = createElectronLaunchOptions('/tmp/netmate/e2e', 'linux', {
      CI: 'true',
    });

    expect(options.args).toEqual([
      '--password-store=gnome-libsecret',
      '--ozone-platform=x11',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      path.join('/tmp/netmate', 'dist-e2e', 'e2e-main.js'),
    ]);
    expect(options.cwd).toBe(path.join('/tmp/netmate/e2e', '..'));
    expect(options.env.NETMATE_E2E).toBe('1');
    expect(options.env.ELECTRON_DISABLE_SANDBOX).toBe('1');
  });

  it('当不是 Linux 且未处于 CI 时不应附加无沙箱参数', () => {
    const options = createElectronLaunchOptions('/tmp/netmate/e2e', 'darwin', {});

    expect(options.args).toEqual([path.join('/tmp/netmate', 'dist-e2e', 'e2e-main.js')]);
    expect(options.env.NETMATE_E2E).toBe('1');
    expect(options.env.ELECTRON_DISABLE_SANDBOX).toBeUndefined();
  });

  it('只向 Electron 传递已定义的字符串环境变量', () => {
    const options = createElectronLaunchOptions('/tmp/netmate/e2e', 'darwin', {
      E2E_NETWORK_STATE: 'offline',
      E2E_UNSET: undefined,
    });

    expect(options.env.E2E_NETWORK_STATE).toBe('offline');
    expect(options.env).not.toHaveProperty('E2E_UNSET');
  });
});
