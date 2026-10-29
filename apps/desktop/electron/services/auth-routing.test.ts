// Regressions for authentication addresses and persisted logout portals.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountManager,
  AuthService,
  ConfigManager,
  MemoryStorageAdapter,
  WifiManager,
  createDefaultAppConfig,
  createLogger,
  type NetworkDetector,
} from '@repo/shared';

const ports = vi.hoisted(() => ({ interfaces: vi.fn(), socket: vi.fn(), http: vi.fn() }));
vi.mock('node:os', () => ({ networkInterfaces: ports.interfaces }));
vi.mock('dgram', () => ({ createSocket: ports.socket }));
vi.mock('./wifi-detector', () => ({
  getCurrentWifiSSID: async () => ({ ssid: 'Campus', connected: true }),
}));
vi.mock('../../../../packages/shared/src/utils/httpClient', () => ({
  httpGet: ports.http,
  HttpError: class HttpError extends Error {},
}));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock('electron-updater', () => ({ autoUpdater: {} }));
import { AutoReconnectService } from './auto-reconnect';
import { configureAuthSession, manualLogin, manualLogout } from './auth-session';

const account = {
  id: 'global',
  name: 'global',
  username: 'fixture-global',
  password: 'fixture-only',
  isp: 'campus' as const,
  serverUrl: 'http://192.0.2.10:801',
};
async function configuration() {
  const storage = new MemoryStorageAdapter();
  const config = new ConfigManager(storage);
  await config.load();
  await config.save(
    createDefaultAppConfig({
      accounts: [
        account,
        {
          ...account,
          id: 'linked',
          username: 'fixture-linked',
          serverUrl: 'http://192.0.2.20:801',
        },
      ],
      currentAccountId: 'global',
      wifiList: [
        {
          id: 'campus',
          ssid: 'Campus',
          security: 'Open',
          password: '',
          autoConnect: true,
          requiresAuth: true,
          priority: 1,
          linkedAccountIds: ['linked'],
          lastConnectedAt: null,
        },
      ],
    })
  );
  return { config, storage };
}
const status = {
  connected: false,
  authenticated: false,
  wifiConnected: true,
  ssid: 'Campus',
  security: 'Open',
  ip: '192.168.5.10',
  requiresAuth: true,
};

describe('comprehensive functional review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ports.http.mockImplementation(async (url: string) => ({
      status: url.includes('/eportal/') ? 200 : 204,
      rawText: url.includes('/logout') ? 'cb({"result":1})' : 'cb({"status":1})',
    }));
  });

  it('automatic authentication sends the WiFi address to its linked portal despite a 10.x VPN interface', async () => {
    ports.interfaces.mockReturnValue({
      wlan0: [
        { address: '192.168.5.10', family: 'IPv4', internal: false, mac: '02:00:00:00:00:01' },
      ],
      tun0: [{ address: '10.88.0.2', family: 'IPv4', internal: false, mac: '02:00:00:00:00:02' }],
    });
    const connect = vi.fn((_port: number, _host: string, done: () => void) => done());
    ports.socket.mockReturnValue({
      on: vi.fn(),
      close: vi.fn(),
      connect,
      address: () => ({ address: '192.168.5.10' }),
    });
    const { config } = await configuration();
    const logger = createLogger();
    const auth = new AuthService(account.serverUrl, logger);
    const service = new AutoReconnectService(
      auth,
      new AccountManager(config, logger),
      logger,
      { maxRetries: 0 },
      {},
      new WifiManager(config, logger),
      config
    );
    await service.handleStatusChange(status, 'network');
    const loginUrl = ports.http.mock.calls
      .map((call) => new URL(call[0]))
      .find((url) => url.pathname.endsWith('/login'))!;
    expect(loginUrl.hostname).toBe('192.0.2.20');
    expect(loginUrl.searchParams.get('wlan_user_ip')).toBe('192.168.5.10');
    expect(connect).not.toHaveBeenCalled();
    logger.stopAutoCleanup();
  });

  it('a restart retains the successful portal even if the WiFi account selection later changes', async () => {
    const { config, storage } = await configuration();
    const detector = { getNetworkStatus: async () => status } as unknown as NetworkDetector;
    const auth = new AuthService(account.serverUrl);
    configureAuthSession(auth, storage, detector);
    expect((await manualLogin(auth, config, detector)).success).toBe(true);
    await config.update({ wifiList: [] });
    const reloaded = new ConfigManager(storage);
    await reloaded.load();
    // This is the exact constructor selection made in main-services.ts on process startup.
    const saved = reloaded.getConfig()!;
    const restarted = new AuthService(
      saved.accounts.find((entry) => entry.id === saved.currentAccountId)?.serverUrl
    );
    configureAuthSession(restarted, storage, detector);
    await manualLogout(restarted, reloaded, detector);
    const logoutUrl = new URL(
      ports.http.mock.calls.filter((call) => call[0].includes('/logout')).pop()![0]
    );
    expect(logoutUrl.hostname).toBe('192.0.2.20');
  });
});
