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
import { configureAuthSession, manualLogin, manualLogout } from './auth-session';
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

it('保存关联账号的成功门户，重建服务后仍向同一门户注销', async () => {
  const { storage, config, auth, detector } = await setup();
  await config.update((current) => ({
    accounts: current.accounts.map((entry) => ({
      ...entry,
      serverUrl: entry.id === 'two' ? 'http://two.test' : 'http://one.test',
    })),
  }));
  configureAuthSession(auth, storage, detector);
  vi.spyOn(auth, 'loginWithAccounts').mockResolvedValue({
    success: true,
    message: 'ok',
    accountId: 'two',
    attempts: [],
  });
  await manualLogin(auth, config, detector);
  const restarted = new AuthService('http://one.test');
  configureAuthSession(restarted, storage, detector);
  const logout = vi.spyOn(restarted, 'logout').mockResolvedValue({ success: true, message: 'ok' });
  await manualLogout(restarted, config, detector);
  expect(logout).toHaveBeenCalledWith('10.1.2.3', 'http://two.test');
  expect(await storage.get('auth_session')).toBeNull();
});
it('无成功会话记录且关联多个门户时不向全局门户猜测注销', async () => {
  const { storage, config, auth, detector } = await setup();
  await config.update((current) => ({
    accounts: current.accounts.map((entry) => ({
      ...entry,
      serverUrl: 'http://' + entry.id + '.test',
    })),
  }));
  configureAuthSession(auth, storage, detector);
  const logout = vi.spyOn(auth, 'logout');
  expect((await manualLogout(auth, config, detector)).success).toBe(false);
  expect(logout).not.toHaveBeenCalled();
});
