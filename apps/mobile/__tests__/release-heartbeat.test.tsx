import { renderHook } from '@testing-library/react-native';
import { NativeModules } from 'react-native';
import { DEFAULT_APP_SETTINGS, type AppConfig } from '@repo/shared';
import { useAutoAuth } from '../src/hooks/useAutoAuth';
import type { MobileServices } from '../src/context/mobileServices';

const baseConfig: AppConfig = {
  accounts: [
    {
      id: 'a1',
      name: '校园网',
      username: '23103421',
      password: 'pw1',
      serverUrl: '',
      isp: 'campus',
    },
    { id: 'a2', name: '联通', username: '23103421', password: 'pw2', serverUrl: '', isp: 'cucc' },
    { id: 'a3', name: '空密码', username: 'x', password: '', serverUrl: '', isp: 'campus' },
  ],
  currentAccountId: 'a1',
  wifiList: [
    {
      id: 'w1',
      ssid: 'TUST-5G',
      password: 'secret',
      autoConnect: true,
      requiresAuth: true,
      linkedAccountIds: ['a2'],
      priority: 1,
      lastConnectedAt: null,
    },
  ],
  settings: { ...DEFAULT_APP_SETTINGS, autoReconnect: true },
};

import { act } from '@testing-library/react-native';

test('foreground periodic authentication respects disabled heartbeat', async () => {
  jest.useFakeTimers();
  const native = {
    syncProfile: jest.fn().mockResolvedValue(true),
    checkNow: jest.fn().mockResolvedValue(null),
    getLastResult: jest.fn().mockResolvedValue(null),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  };
  NativeModules.AutoAuthModule = native;
  const config = { ...baseConfig, settings: { ...baseConfig.settings, enableHeartbeat: false } };
  const servicesRef = {
    current: { configManager: { getConfig: () => config } } as unknown as MobileServices,
  };
  const { unmount } = renderHook(() =>
    useAutoAuth({
      servicesRef,
      config,
      accounts: config.accounts,
      currentAccount: config.accounts[0],
      ready: true,
      addLog: jest.fn(),
      syncManagedExternally: true,
    })
  );
  try {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const initial = native.checkNow.mock.calls.length;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60000);
    });
    expect(native.checkNow.mock.calls.length - initial).toBe(0);
  } finally {
    unmount();
    delete NativeModules.AutoAuthModule;
    jest.useRealTimers();
  }
});
