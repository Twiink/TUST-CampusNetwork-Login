import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  AccountManager,
  ConfigManager,
  MemoryStorageAdapter,
  WifiManager,
  createDefaultAppConfig,
  createLogger,
} from '@repo/shared';
import type { AuthService, NetworkDetector } from '@repo/shared';

const mocks = vi.hoisted(() => ({
  currentWifi: vi.fn(),
  networkInfo: vi.fn(),
  probe: vi.fn(),
  scan: vi.fn(),
}));
vi.mock('electron', () => ({ BrowserWindow: class {} }));
vi.mock('@repo/native', () => ({
  currentWifi: mocks.currentWifi,
  networkInfo: mocks.networkInfo,
  watchNetwork: () => false,
}));
vi.mock('./wifi-event-listener/ssid-probe', () => ({ probeCurrentSsid: mocks.probe }));
vi.mock('./wifi-switcher', () => ({ scanAvailableNetworks: mocks.scan }));
vi.mock('./network', () => ({
  enrichStatusAuthFields: vi.fn(),
  getCurrentWifiSSID: vi.fn(),
  resolveNetworkInfo: vi.fn(),
}));
import { DesktopWifiAdapter, resetNativeWifiModuleForTests } from './wifi-adapter';
import { WifiEventListener } from './wifi-event-listener';
import { manualLogin } from './auth-session';
import { executeStartupAutoConnect } from './wifi-event-listener/reconnect-flow';
import { AutoReconnectService } from './auto-reconnect';
import { resolveNetworkInfo } from './network';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
  vi.clearAllMocks();
  mocks.scan.mockResolvedValue([]);
  resetNativeWifiModuleForTests();
});
afterEach(() => vi.useRealTimers());

test('manual login after a WiFi change uses the new network IP', async () => {
  const adapter = new DesktopWifiAdapter();
  mocks.currentWifi.mockReturnValue({ ssid: 'Old', bssid: 'aa:bb:cc:dd:ee:01' });
  const info = (ipv4: string) => ({
    ipv4,
    mac: 'aa:bb:cc:dd:ee:ff',
    gateway: '10.0.0.1',
    subnetMask: '255.0.0.0',
    dns: ['10.0.0.1'],
  });
  mocks.networkInfo.mockReturnValue(info('10.1.1.2'));
  await adapter.getWifiDetails();
  vi.advanceTimersByTime(2000);
  mocks.currentWifi.mockReturnValue({ ssid: 'New', bssid: 'aa:bb:cc:dd:ee:02' });
  mocks.networkInfo.mockReturnValue(info('10.2.2.3'));
  const details = await adapter.getWifiDetails();
  expect(details).toMatchObject({ ssid: 'New', ipv4: '10.2.2.3' });
  const manager = new ConfigManager(new MemoryStorageAdapter());
  await manager.load();
  await manager.save(
    createDefaultAppConfig({
      accounts: [
        {
          id: 'a',
          name: 'a',
          username: 'fixture',
          password: 'fixture',
          serverUrl: 'http://portal.test',
          isp: 'campus',
        },
      ],
      currentAccountId: 'a',
    })
  );
  const loginWithAccounts = vi.fn().mockResolvedValue({ success: true, attempts: [] });
  const auth = {
    runExclusive: (operation: () => unknown) => operation(),
    loginWithAccounts,
  } as unknown as AuthService;
  const detector = {
    getNetworkStatus: async () => {
      const wifi = await adapter.getWifiDetails();
      return { ...wifi, ip: wifi?.ipv4, wifiConnected: true };
    },
  } as unknown as NetworkDetector;
  await manualLogin(auth, manager, detector);
  expect(loginWithAccounts.mock.calls[0][1].wlanUserIp).toBe('10.2.2.3');
});

test.each([false, true])(
  'window destroyed=%s still delivers network events to auth service',
  async (destroyed) => {
    const auth = {
      handleStatusChange: vi.fn().mockResolvedValue(undefined),
      invalidateNetwork: vi.fn(),
    };
    const listener = new WifiEventListener({
      window: { isDestroyed: () => destroyed, webContents: { send: vi.fn() } } as never,
      checkInterval: 1000,
      logger: createLogger(),
      autoReconnectService: auth as never,
      networkDetector: {
        getNetworkStatus: async () => ({ ssid: 'Old', wifiConnected: true, connected: false }),
      } as never,
    });
    mocks.probe.mockResolvedValue('Old');
    listener.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(auth.handleStatusChange).toHaveBeenCalled();
    auth.handleStatusChange.mockClear();
    mocks.probe.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(auth.handleStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ wifiConnected: false }),
      'network'
    );
    listener.stop();
  }
);

test('startup switch stops when continuation is revoked', async () => {
  const connect = vi.fn().mockResolvedValue(true);
  const cancelled = vi.fn().mockResolvedValue(false);
  const result = await executeStartupAutoConnect('Unconfigured', {
    logger: createLogger(),
    wifiManager: {
      getWifiConfigs: () => [
        { id: 'a', ssid: 'Saved', password: '', autoConnect: true, priority: 1 },
      ],
    } as never,
    wifiSwitcherService: {
      setConfiguredNetworks: vi.fn(),
      connectToConfiguredNetwork: connect,
    } as never,
    configManager: {
      getConfig: () => ({ settings: { startupAutoConnect: true, keepCurrentConnection: false } }),
    } as never,
    scanAvailableSsids: async () => ['Saved'],
    shouldContinue: cancelled,
    onProgress: vi.fn(),
    onAllFailed: vi.fn(),
    onReconnected: vi.fn(),
  });
  expect(result).toBeNull();
  expect(connect).not.toHaveBeenCalled();
  expect(cancelled).toHaveBeenCalled();
});

test.each(['setting', 'stop', 'rules'])(
  'startup scan from listener is cancelled by %s',
  async (reason) => {
    const config = new ConfigManager(new MemoryStorageAdapter());
    await config.load();
    await config.update((current) => ({
      settings: { ...current.settings, startupAutoConnect: true, keepCurrentConnection: false },
      wifiList: [
        {
          id: 'saved',
          ssid: 'Saved',
          password: '',
          autoConnect: true,
          requiresAuth: false,
          linkedAccountIds: [],
          priority: 1,
          lastConnectedAt: null,
        },
      ],
    }));
    let finish!: (networks: { ssid: string }[]) => void;
    mocks.scan.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    mocks.probe.mockResolvedValue('Cafe');
    const connect = vi.fn().mockResolvedValue(true);
    const listener = new WifiEventListener({
      window: null,
      logger: createLogger(),
      configManager: config,
      wifiManager: new WifiManager(config),
      networkDetector: {
        getNetworkStatus: async () => ({
          wifiConnected: true,
          ssid: 'Cafe',
          connected: true,
          authenticated: false,
        }),
        isWifiEnabled: async () => true,
      } as unknown as NetworkDetector,
      wifiSwitcherService: {
        setConfiguredNetworks: vi.fn(),
        connectToConfiguredNetwork: connect,
      } as never,
    });
    listener.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.scan).toHaveBeenCalledOnce();
    if (reason === 'setting') await config.updateSettings({ autoReconnect: false });
    if (reason === 'stop') listener.stop();
    if (reason === 'rules') await config.update({ wifiList: [] });
    finish([{ ssid: 'Saved' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(connect).not.toHaveBeenCalled();
    listener.stop();
  }
);

test('a pending login does not retry the previous account after window teardown and a network change', async () => {
  const manager = new ConfigManager(new MemoryStorageAdapter());
  await manager.load();
  await manager.save(
    createDefaultAppConfig({
      accounts: ['old', 'new'].map((id) => ({
        id,
        name: id,
        username: id,
        password: 'fixture',
        serverUrl: 'http://portal.test',
        isp: 'campus' as const,
      })),
      currentAccountId: 'old',
      wifiList: ['Old', 'New'].map((ssid, index) => ({
        id: ssid,
        ssid,
        password: '',
        autoConnect: false,
        requiresAuth: true,
        priority: index + 1,
        lastConnectedAt: null,
        linkedAccountIds: [index === 0 ? 'old' : 'new'],
      })),
    })
  );
  vi.mocked(resolveNetworkInfo).mockResolvedValue({ ipv4: '10.1.1.2', ipv6: null, mac: null });
  const loginWithAccounts = vi
    .fn()
    .mockResolvedValueOnce({ success: false, message: 'fixture rejected', attempts: [] })
    .mockResolvedValue({ success: true, attempts: [] });
  const auth = {
    runExclusive: (operation: () => unknown) => operation(),
    loginWithAccounts,
  } as unknown as AuthService;
  const logger = createLogger();
  const service = new AutoReconnectService(
    auth,
    new AccountManager(manager),
    logger,
    { maxRetries: 2, initialDelay: 10000 },
    {},
    new WifiManager(manager),
    manager
  );
  let destroyed = false;
  const listener = new WifiEventListener({
    window: { isDestroyed: () => destroyed, webContents: { send: vi.fn() } } as never,
    checkInterval: 1000,
    logger,
    autoReconnectService: service,
    networkDetector: {
      getNetworkStatus: async () => ({
        ssid: 'Old',
        wifiConnected: true,
        connected: false,
        requiresAuth: true,
        ip: '10.1.1.2',
      }),
    } as never,
  });
  mocks.probe.mockResolvedValue('Old');
  listener.start();
  await vi.advanceTimersByTimeAsync(2000);
  expect(loginWithAccounts).toHaveBeenCalledTimes(1);
  destroyed = true;
  mocks.probe.mockResolvedValue('New');
  vi.mocked(resolveNetworkInfo).mockResolvedValue({ ipv4: '10.2.2.3', ipv6: null, mac: null });
  await vi.advanceTimersByTimeAsync(10000);
  expect(loginWithAccounts.mock.calls.slice(1).some((call) => call[0][0].id === 'old')).toBe(false);
  expect(loginWithAccounts.mock.calls[0][2].shouldContinue()).toBe(false);
  listener.stop();
});

test('same SSID identity changes cancel auth before connectivity probing finishes', async () => {
  let address = '10.1.1.2';
  let hold = false;
  let finish!: (value: unknown) => void;
  const auth = {
    handleStatusChange: vi.fn().mockResolvedValue(undefined),
    invalidateNetwork: vi.fn(),
  };
  const listener = new WifiEventListener({
    window: null,
    checkInterval: 1000,
    logger: createLogger(),
    autoReconnectService: auth as never,
    networkDetector: {
      invalidateCache: vi.fn(),
      getWifiSnapshot: async () => ({
        ssid: 'Campus',
        bssid: address,
        ipv4: address,
        security: 'WPA2',
      }),
      getNetworkStatus: async () =>
        hold
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : { ssid: 'Campus', wifiConnected: true, connected: false, ip: address },
    } as never,
  });
  mocks.probe.mockResolvedValue('Campus');
  listener.start();
  await vi.advanceTimersByTimeAsync(1000);
  auth.invalidateNetwork.mockClear();
  address = '10.2.2.3';
  hold = true;
  await vi.advanceTimersByTimeAsync(1000);
  expect(auth.invalidateNetwork).toHaveBeenCalled();
  listener.stop();
  finish({ ssid: 'Campus', wifiConnected: true, connected: false, ip: address });
});
