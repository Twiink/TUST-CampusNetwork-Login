import { describe, expect, it, vi } from 'vitest';
import {
  AuthService,
  ConfigManager,
  MemoryStorageAdapter,
  createDefaultAppConfig,
  type NetworkDetector,
} from '@repo/shared';
vi.mock('./network', () => ({
  resolveNetworkInfo: async () => ({ ipv4: '10.1.2.3' }),
  getCurrentWifiSSID: async () => ({ ssid: 'TUST', connected: true }),
}));
import { manualLogin, manualLogout } from './auth-session';
const account = {
  id: 'one',
  name: 'one',
  username: 'one',
  password: 'fake',
  isp: 'campus' as const,
  serverUrl: 'http://one.test',
};
async function setup() {
  const storage = new MemoryStorageAdapter();
  const config = new ConfigManager(storage);
  await config.load();
  await config.save(
    createDefaultAppConfig({
      accounts: [account, { ...account, id: 'two', username: 'two' }],
      currentAccountId: 'one',
      wifiList: [
        {
          id: 'wifi',
          ssid: 'TUST',
          password: '',
          autoConnect: true,
          requiresAuth: true,
          priority: 1,
          linkedAccountIds: ['two', 'one'],
          lastConnectedAt: null,
        },
      ],
    })
  );
  const auth = new AuthService();
  const detector = {
    getNetworkStatus: async () => ({ ssid: 'TUST', ip: '10.1.2.3' }),
  } as NetworkDetector;
  return { storage, config, auth, detector };
}
describe('手动认证入口回归', () => {
  it('关联顺序优先于当前账号，手动登录解除持久暂停', async () => {
    const { config, auth, detector } = await setup();
    await config.updateSettings({ autoAuthPaused: true });
    const login = vi
      .spyOn(auth, 'loginWithAccounts')
      .mockResolvedValue({ success: true, message: 'ok', attempts: [] });
    await manualLogin(auth, config, detector);
    expect(config.getSettings().autoAuthPaused).toBe(false);
    expect(login.mock.calls[0][0].map((entry) => entry.id)).toEqual(['two', 'one']);
  });
  it('在等待正在登录的请求前先持久暂停，注销失败后重启仍暂停', async () => {
    const { storage, config, auth, detector } = await setup();
    let release!: () => void;
    const order: string[] = [];
    const inFlight = auth.runExclusive(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            order.push('login');
            resolve();
          };
        })
    );
    const logout = vi.spyOn(auth, 'logout').mockImplementation(async () => {
      order.push('logout');
      return { success: false, message: 'offline' };
    });
    const pending = manualLogout(auth, config, detector);
    await vi.waitFor(() => expect(config.getSettings().autoAuthPaused).toBe(true));
    expect(logout).not.toHaveBeenCalled();
    release();
    await Promise.all([inFlight, pending]);
    expect(order).toEqual(['login', 'logout']);
    const restored = new ConfigManager(storage);
    await restored.load();
    expect(restored.getSettings().autoAuthPaused).toBe(true);
  });
});
