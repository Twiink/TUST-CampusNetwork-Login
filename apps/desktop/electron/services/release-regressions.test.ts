import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  AccountManager,
  AuthService,
  ConfigManager,
  MemoryStorageAdapter,
  createDefaultAppConfig,
  createLogger,
} from '@repo/shared';

const ports = vi.hoisted(() => ({
  exec: vi.fn(),
  execFile: vi.fn(),
  windows: vi.fn(),
  network: vi.fn(),
  storagePath: '',
}));
vi.mock('node:child_process', () => ({ exec: ports.exec, execFile: ports.execFile }));
vi.mock('../utils/win-exec', () => ({
  execWindowsText: ports.windows,
  execWindowsFileText: vi.fn(),
}));
vi.mock('../utils/dev-log', () => ({
  devLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('./network', () => ({ resolveNetworkInfo: ports.network }));
vi.mock('electron', () => ({
  app: { getPath: () => ports.storagePath },
  safeStorage: { isEncryptionAvailable: () => false },
}));

import { scanAvailableNetworks } from './wifi-switcher';
import { resolveLinuxNetworkInfo } from './wifi-adapter/linux';
import { AutoReconnectService } from './auto-reconnect';
import { ElectronStorageAdapter } from './store';

function commandOutput(value: string) {
  const impl = (...args: unknown[]) => {
    const callback = args[args.length - 1] as (error: unknown, value: unknown) => void;
    callback(null, { stdout: value, stderr: '' });
  };
  ports.exec.mockImplementation(impl);
  ports.execFile.mockImplementation(impl);
}
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

test('Windows scan keeps BSSID rows inside their parent SSID block', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
  ports.windows.mockResolvedValue(
    [
      'SSID 1 : Campus',
      '    Authentication : WPA2-Personal',
      '    Encryption : CCMP',
      '    BSSID 1 : aa:bb:cc:dd:ee:ff',
      '         Signal : 86%',
      '         Radio type : 802.11ax',
    ].join('\r\n') + '\r\n'
  );
  expect(await scanAvailableNetworks()).toEqual([
    { ssid: 'Campus', signal: 86, security: 'WPA2-Personal', bssid: 'aa:bb:cc:dd:ee:ff' },
  ]);
});

test('Linux scan decodes escaped colon in SSID', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
  commandOutput('Dorm\\:5G:80:WPA2\n');
  expect(await scanAvailableNetworks()).toEqual([
    { ssid: 'Dorm:5G', signal: 80, security: 'WPA2' },
  ]);
});

test('Linux network fallback reads indexed nmcli IP fields', async () => {
  commandOutput(
    'GENERAL.HWADDR:AA\\:BB\\:CC\\:DD\\:EE\\:FF\nIP4.ADDRESS[1]:10.1.2.3/24\nIP4.GATEWAY:10.1.2.1\nIP4.DNS[1]:10.1.2.1\n'
  );
  expect(await resolveLinuxNetworkInfo()).toMatchObject({
    ipv4: '10.1.2.3',
    subnetMask: '255.255.255.0',
    dns: ['10.1.2.1'],
  });
});

test('desktop authentication retry stops after the active WiFi changes', async () => {
  const account = {
    id: 'a',
    name: 'Audit',
    username: 'review-account',
    password: 'review-dummy-value',
    isp: 'campus' as const,
    serverUrl: 'http://portal.test',
  };
  const storage = new MemoryStorageAdapter();
  await storage.set(
    'app_config',
    createDefaultAppConfig({ accounts: [account], currentAccountId: 'a' })
  );
  const config = new ConfigManager(storage);
  await config.load();
  const auth = new AuthService();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const login = vi
    .spyOn(auth, 'login')
    .mockImplementationOnce(async () => {
      await gate;
      return { success: false, message: 'timeout' };
    })
    .mockResolvedValue({ success: true, message: 'ok' });
  ports.network.mockResolvedValue({ ipv4: '10.1.2.3' });
  const service = new AutoReconnectService(
    auth,
    new AccountManager(config),
    createLogger(),
    {
      maxRetries: 1,
      initialDelay: 1,
      maxDelay: 1,
    },
    {},
    undefined,
    config
  );
  const pending = service.handleStatusChange({
    ssid: 'Campus',
    wifiConnected: true,
    connected: false,
    authenticated: false,
    requiresAuth: true,
  });
  await vi.waitFor(() => expect(login).toHaveBeenCalledTimes(1));
  ports.network.mockResolvedValue({ ipv4: '192.168.1.20' });
  await service.handleStatusChange(
    {
      ssid: 'Home',
      wifiConnected: true,
      connected: true,
      authenticated: false,
      requiresAuth: false,
    },
    'network'
  );
  release();
  await pending;
  expect(login).toHaveBeenCalledTimes(1);
});

test('desktop storage does not silently persist cleartext passwords without encryption', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'netmate-storage-audit-'));
  ports.storagePath = directory;
  try {
    const storage = new ElectronStorageAdapter();
    await expect(
      storage.set('app_config', { accounts: [{ password: 'review-dummy-value' }] })
    ).rejects.toThrow('钥匙串');
    await expect(readFile(path.join(directory, 'config.json'), 'utf8')).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
