import React from 'react';
import { AppState } from 'react-native';
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
  onPersistentLog: jest.fn().mockReturnValue(null),
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
  jest.requireMock('../src/native/Logs').onPersistentLog.mockReturnValue(null);
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
  // Existing readable entries remain until durable clear succeeds. The stale page must not alter the cursor.
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
  expect(queryPersistentLogPage).toHaveBeenLastCalledWith(null, {});
  unmount();
});

test('a native record received during a query survives the older disk snapshot', async () => {
  const { onPersistentLog } = jest.requireMock('../src/native/Logs');
  let receive!: (entry: unknown) => void;
  onPersistentLog.mockImplementation((callback: typeof receive) => {
    receive = callback;
    return { remove: jest.fn() };
  });
  const { result } = await setup();
  let finish!: (page: unknown) => void;
  (queryPersistentLogPage as jest.Mock).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  let query!: Promise<void>;
  act(() => {
    query = result.current.queryLogs({ level: 'error' });
  });
  await waitFor(() => expect(finish).toBeDefined());
  const live = {
    id: 'during-query',
    timestamp: Date.now(),
    level: 'error',
    message: 'live native log',
    source: 'wifi',
  };
  act(() => receive(live));
  await act(async () => {
    finish({ entries: [], nextCursor: null, hasMore: false, total: 0 });
    await query;
  });
  expect(result.current.logs.map(entry => entry.id)).toEqual(['during-query']);
});

test('returning to foreground backfills all missed native pages by ID', async () => {
  const watch = jest.spyOn(AppState, 'addEventListener');
  const entries = Array.from({ length: 651 }, (_, index) => ({
    id: `background-${index}`,
    timestamp: Date.now() - index,
    level: 'info',
    source: 'audit',
    message: `background event ${index}`,
  }));
  (queryPersistentLogPage as jest.Mock).mockResolvedValue({
    entries: entries.slice(650),
    nextCursor: null,
    hasMore: false,
    total: 1,
  });
  const { result, unmount } = await setup();
  try {
    await act(async () => {
      await result.current.queryLogs({ source: 'audit' });
    });
    expect(result.current.logs).toHaveLength(1);
    (queryPersistentLogPage as jest.Mock).mockImplementation(async (cursor: string | null) => {
      const offset = Number(cursor ?? 0);
      return {
        entries: entries.slice(offset, offset + 500),
        nextCursor: String(offset + 500),
        hasMore: offset + 500 < entries.length,
        total: entries.length,
      };
    });
    const active = watch.mock.calls.find(([event]) => event === 'change')![1] as (
      state: string
    ) => void;
    act(() => active('active'));
    await waitFor(() => expect(result.current.logs).toHaveLength(651));
    expect(new Set(result.current.logs.map(entry => entry.id)).size).toBe(651);
  } finally {
    unmount();
    watch.mockRestore();
  }
});
