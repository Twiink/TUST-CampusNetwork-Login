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
  queryPersistentLogPage: jest
    .fn()
    .mockResolvedValue({ entries: [], nextCursor: null, hasMore: false }),
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

import { queryPersistentLogPage } from '../src/native/Logs';

test('loading older logs remains stable when a new log arrives', async () => {
  const entry = (id: number) => ({
    id: `history-${id}`,
    timestamp: Date.now() - id,
    level: 'info',
    message: 'audit event',
    source: 'audit',
  });
  (queryPersistentLogPage as jest.Mock)
    .mockResolvedValueOnce({
      entries: Array.from({ length: 500 }, (_, i) => entry(i)),
      nextCursor: 'cursor',
      hasMore: true,
    })
    .mockResolvedValueOnce({
      entries: Array.from({ length: 100 }, (_, i) => entry(i + 500)),
      nextCursor: 'end',
      hasMore: false,
    });
  const { result, unmount } = await setup();
  await act(async () => {
    await result.current.loadMoreLogs();
  });
  const count = result.current.logs.length;
  expect(count).toBeGreaterThan(500);
  await act(async () => {
    result.current.addLog('info', 'new audit event');
  });
  const after = result.current.logs.length;
  unmount();
  expect(after).toBe(count + 1);
});

test('clear invalidates a pending page and pagination waits for durable clear', async () => {
  const { clearPersistentLogs } = jest.requireMock('../src/native/Logs');
  const entry = { id: 'old', timestamp: Date.now(), level: 'info', message: 'old history' };
  let resolvePage!: (value: unknown) => void;
  let resolveClear!: (value: unknown) => void;
  (queryPersistentLogPage as jest.Mock)
    .mockResolvedValueOnce({ entries: [entry], nextCursor: 'cursor', hasMore: true })
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolvePage = resolve;
        })
    )
    .mockResolvedValueOnce({ entries: [], nextCursor: null, hasMore: false });
  const { result, unmount } = await setup();
  let oldPage!: Promise<void>;
  act(() => {
    oldPage = result.current.loadMoreLogs();
  });
  await waitFor(() => expect(resolvePage).toBeDefined());
  clearPersistentLogs.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        resolveClear = resolve;
      })
  );
  await act(async () => {
    result.current.clearLogs();
  });
  await act(async () => {
    resolvePage({ entries: [entry], nextCursor: null, hasMore: false });
    await oldPage;
  });
  expect(result.current.logs.some(log => log.id === 'old')).toBe(false);
  const calls = (queryPersistentLogPage as jest.Mock).mock.calls.length;
  let afterClear!: Promise<void>;
  act(() => {
    afterClear = result.current.loadMoreLogs();
  });
  expect((queryPersistentLogPage as jest.Mock).mock.calls).toHaveLength(calls);
  await act(async () => {
    resolveClear('new-generation');
    await afterClear;
  });
  expect(result.current.logs.some(log => log.id === 'old')).toBe(false);
  expect(queryPersistentLogPage).toHaveBeenLastCalledWith(null);
  unmount();
});
