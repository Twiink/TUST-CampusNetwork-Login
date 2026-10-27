import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  AccountManager,
  AuthService,
  ConfigManager,
  MemoryStorageAdapter,
  WifiManager,
  createDefaultAppConfig,
  createLogger,
  type AppConfig,
} from '@repo/shared';
import { AppProvider, useApp } from '../src/context/AppContext';
import { createMobileServices } from '../src/context/mobileServices';
import * as NativeAuth from '../src/native/AutoAuth';
import * as Wifi from '../src/native/WifiModule';

jest.mock('../src/context/mobileServices', () => ({ createMobileServices: jest.fn() }));
jest.mock('../src/hooks/useAutoAuth', () => ({ useAutoAuth: jest.fn() }));
jest.mock('../src/hooks/usePermissionGuide', () => ({
  usePermissionGuide: () => ({ items: [], request: jest.fn(), runGuide: jest.fn() }),
}));
jest.mock('../src/native/AppUpdater', () => ({
  autoCheckForUpdate: jest.fn().mockResolvedValue(null),
}));
jest.mock('../src/native/BackgroundService', () => ({ isBackgroundServiceAvailable: () => false }));
jest.mock('../src/native/AutoStart', () => ({ isAutoStartAvailable: () => false }));
jest.mock('../src/native/Logs', () => ({
  queryPersistentLogs: jest.fn().mockResolvedValue([]),
  appendPersistentLog: jest.fn().mockResolvedValue(undefined),
  clearPersistentLogs: jest.fn().mockResolvedValue(undefined),
  onPersistentLog: () => null,
  exportPersistentLogs: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/native/WifiModule', () => ({
  isNativeModuleAvailable: () => true,
  hasLocationPermission: jest.fn().mockResolvedValue(true),
  requestLocationPermission: jest.fn().mockResolvedValue(true),
  getNetworkInfo: jest.fn(),
  startWatching: jest.fn().mockResolvedValue(true),
  stopWatching: jest.fn().mockResolvedValue(true),
  onWifiChanged: () => ({ remove: jest.fn() }),
}));
jest.mock('../src/native/AutoAuth', () => ({
  ...jest.requireActual('../src/native/AutoAuth'),
  isAutoAuthAvailable: jest.fn(),
  syncAutoAuthProfile: jest.fn(),
  getAuthSnapshot: jest.fn(),
  nativeLogin: jest.fn(),
  nativeLogout: jest.fn(),
  onAuthSnapshot: () => null,
  onWifiReconnectProgress: () => null,
  getReconnectProgress: jest.fn().mockResolvedValue(null),
}));

const account = {
  id: 'a1',
  name: 'One',
  username: '20260001',
  password: 'secret',
  serverUrl: 'http://portal.test',
  isp: 'campus' as const,
};
const network = {
  wifiEnabled: true,
  connected: true,
  ssid: 'TUST',
  ipv4: '10.1.2.3',
  ipv6: null,
  mac: null,
  networkKey: 'one',
};
const initial = () =>
  createDefaultAppConfig({
    accounts: [account, { ...account, id: 'a2', username: 'second' }],
    currentAccountId: 'a1',
    wifiList: [
      {
        id: 'w1',
        ssid: 'TUST',
        password: '',
        autoConnect: true,
        requiresAuth: true,
        linkedAccountIds: ['a2', 'a1'],
        priority: 1,
        lastConnectedAt: null,
      },
    ],
  });
async function setup(config: AppConfig = initial(), existing?: MemoryStorageAdapter) {
  const storage = existing ?? new MemoryStorageAdapter();
  if (!existing) await storage.set('app_config', config);
  const manager = new ConfigManager(storage);
  const logger = createLogger();
  const auth = new AuthService(undefined, logger);
  jest
    .spyOn(auth, 'loginWithAccounts')
    .mockResolvedValue({ success: true, message: '登录成功', attempts: [] });
  jest.spyOn(auth, 'logout').mockResolvedValue({ success: false, message: '注销失败' });
  const services = {
    configManager: manager,
    authService: auth,
    accountManager: new AccountManager(manager),
    wifiManager: new WifiManager(manager),
    logger,
    networkDetector: {},
  };
  (createMobileServices as jest.Mock).mockReturnValue(services);
  const view = renderHook(useApp, {
    wrapper: ({ children }: { children: React.ReactNode }) => <AppProvider>{children}</AppProvider>,
  });
  await waitFor(() => expect(view.result.current.configurationState).toBe('saved'));
  return { ...view, storage, manager, auth };
}
beforeEach(() => {
  jest.clearAllMocks();
  (NativeAuth.isAutoAuthAvailable as jest.Mock).mockReturnValue(false);
  (NativeAuth.syncAutoAuthProfile as jest.Mock).mockResolvedValue(true);
  (NativeAuth.getAuthSnapshot as jest.Mock).mockResolvedValue({
    networkKey: 'one',
    wifiConnected: true,
    requiresAuth: true,
    authenticated: false,
    internetReachable: false,
    paused: false,
    revision: 0,
  });
  (Wifi.getNetworkInfo as jest.Mock).mockResolvedValue(network);
});

test('配置队列合并设置、账号和 WiFi 修改，等待落盘后发布', async () => {
  const { result, manager } = await setup();
  await act(async () => {
    await Promise.all([
      result.current.setConfig(current => ({
        ...current,
        settings: { ...current.settings, autoReconnect: false },
      })),
      result.current.setConfig(current => ({
        ...current,
        wifiList: current.wifiList.map(wifi => ({ ...wifi, priority: 3 })),
      })),
      result.current.updateAccount('a1', { name: 'Edited' }),
    ]);
  });
  expect(result.current.config).toMatchObject({
    revision: 3,
    settings: { autoReconnect: false },
    wifiList: [{ priority: 3 }],
  });
  expect(result.current.accounts[0].name).toBe('Edited');
  expect(manager.getConfig()).toEqual(result.current.config);
});
test('保存失败后保留已显示配置，重试实际未完成的修改', async () => {
  const { result, storage } = await setup();
  jest.spyOn(storage, 'set').mockRejectedValueOnce(new Error('disk full'));
  await act(async () => {
    await expect(
      result.current.setConfig(current => ({
        ...current,
        settings: { ...current.settings, autoAuthPaused: true },
      }))
    ).rejects.toThrow('disk full');
  });
  expect(result.current.configurationState).toBe('error');
  expect(result.current.config.settings.autoAuthPaused).toBe(false);
  await act(async () => {
    await result.current.retryConfigurationSync();
  });
  expect(result.current.config.settings.autoAuthPaused).toBe(true);
  expect(result.current.configurationState).toBe('saved');
});
test('后台拒绝同步时不展示已生效，重试后才发布', async () => {
  (NativeAuth.isAutoAuthAvailable as jest.Mock).mockReturnValue(true);
  const { result, manager } = await setup();
  (NativeAuth.syncAutoAuthProfile as jest.Mock).mockResolvedValueOnce(false);
  await act(async () => {
    await expect(
      result.current.setConfig(current => ({
        ...current,
        settings: { ...current.settings, autoAuthPaused: true },
      }))
    ).rejects.toThrow('后台未确认');
  });
  expect(manager.getSettings().autoAuthPaused).toBe(true);
  expect(result.current.config.settings.autoAuthPaused).toBe(false);
  await act(async () => {
    await result.current.retryConfigurationSync();
  });
  expect(result.current.config.settings.autoAuthPaused).toBe(true);
});
test('关联账号按顺序登录，注销失败也保留暂停并跨重启恢复', async () => {
  const view = await setup();
  await act(async () => {
    await view.result.current.login();
  });
  expect(view.auth.loginWithAccounts).toHaveBeenCalledWith(
    [expect.objectContaining({ id: 'a2' }), expect.objectContaining({ id: 'a1' })],
    expect.objectContaining({ wlanUserIp: network.ipv4 }),
    { retrySingle: true }
  );
  await act(async () => {
    await view.result.current.logout();
  });
  expect(view.result.current.config.settings.autoAuthPaused).toBe(true);
  view.unmount();
  const restarted = await setup(initial(), view.storage);
  expect(restarted.result.current.config.settings.autoAuthPaused).toBe(true);
  await act(async () => {
    await restarted.result.current.resumeAutoAuth();
  });
  expect(restarted.result.current.config.settings.autoAuthPaused).toBe(false);
});
test('较早的异步网络读取不会覆盖新网络', async () => {
  const { result } = await setup();
  let finish!: (value: typeof network) => void;
  (Wifi.getNetworkInfo as jest.Mock)
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    )
    .mockResolvedValueOnce({ ...network, ssid: 'New', networkKey: 'two' });
  await act(async () => {
    const older = result.current.refreshNetworkInfo();
    await result.current.refreshNetworkInfo();
    finish({ ...network, ssid: 'Old' });
    await older;
  });
  expect(result.current.networkInfo.ssid).toBe('New');
});
