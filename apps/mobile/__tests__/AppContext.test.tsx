import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { createDefaultAppConfig, type AccountConfig, type AppConfig } from '@repo/shared';
import { AppProvider, useApp } from '../src/context/AppContext';
import type { MobileServices } from '../src/context/mobileServices';
import { createMobileServices } from '../src/context/mobileServices';
import * as WifiModule from '../src/native/WifiModule';
import { useAutoAuth } from '../src/hooks/useAutoAuth';
import { usePermissionGuide } from '../src/hooks/usePermissionGuide';

jest.mock('../src/context/mobileServices', () => ({
  createMobileServices: jest.fn(),
}));

jest.mock('../src/native/WifiModule', () => ({
  getNetworkInfo: jest.fn(),
  requestLocationPermission: jest.fn(),
  hasLocationPermission: jest.fn(),
  isNativeModuleAvailable: jest.fn(),
}));

jest.mock('../src/native/BackgroundService', () => ({
  isBackgroundServiceAvailable: () => false,
  isBackgroundServiceRunning: jest.fn().mockResolvedValue(false),
  startBackgroundService: jest.fn().mockResolvedValue(false),
  stopBackgroundService: jest.fn().mockResolvedValue(false),
}));

jest.mock('../src/native/AutoStart', () => ({
  isAutoStartAvailable: () => false,
  setAutoStartEnabled: jest.fn().mockResolvedValue(false),
}));

jest.mock('../src/native/AppUpdater', () => ({
  autoCheckForUpdate: jest.fn().mockResolvedValue(null),
}));

jest.mock('../src/hooks/useAutoAuth', () => ({
  useAutoAuth: jest.fn(),
}));

jest.mock('../src/hooks/usePermissionGuide', () => ({
  usePermissionGuide: jest.fn(),
}));

const mockCreateMobileServices = createMobileServices as jest.Mock;
const mockGetNetworkInfo = WifiModule.getNetworkInfo as jest.Mock;
const mockHasLocationPermission = WifiModule.hasLocationPermission as jest.Mock;
const mockRequestLocationPermission = WifiModule.requestLocationPermission as jest.Mock;
const mockIsNativeModuleAvailable = WifiModule.isNativeModuleAvailable as jest.Mock;
const mockUseAutoAuth = useAutoAuth as jest.Mock;
const mockUsePermissionGuide = usePermissionGuide as jest.Mock;

const firstAccount: AccountConfig = {
  id: 'a1',
  name: '账号一',
  username: '20250001',
  password: 'secret-1',
  serverUrl: 'http://10.10.102.50:801',
  isp: 'campus',
};

const secondAccount: AccountConfig = {
  id: 'a2',
  name: '账号二',
  username: '20250002',
  password: 'secret-2',
  serverUrl: 'http://10.10.102.50:801',
  isp: 'cmcc',
};

function makeConfig(): AppConfig {
  return {
    ...createDefaultAppConfig(),
    accounts: [firstAccount, secondAccount],
    currentAccountId: firstAccount.id,
    wifiList: [
      {
        id: 'w1',
        ssid: 'TUST-WIFI',
        password: 'wifi-password',
        autoConnect: true,
        requiresAuth: true,
        linkedAccountIds: [secondAccount.id],
        linkedAccountId: secondAccount.id,
        priority: 10,
        lastConnectedAt: null,
      },
    ],
  };
}

function createServices(config: AppConfig) {
  let currentConfig = config;
  const configManager = {
    load: jest.fn().mockResolvedValue(config),
    getConfig: jest.fn(() => currentConfig),
    update: jest.fn(async (partial: Partial<AppConfig>) => {
      currentConfig = {
        ...currentConfig,
        ...partial,
        settings: partial.settings
          ? { ...currentConfig.settings, ...partial.settings }
          : currentConfig.settings,
      };
      return currentConfig;
    }),
  };
  const authService = {
    setServerUrl: jest.fn(),
    loginWithRetry: jest.fn().mockResolvedValue({ success: true, message: '登录成功' }),
    loginWithAccounts: jest.fn().mockResolvedValue({ success: true, message: '登录成功' }),
    logout: jest.fn().mockResolvedValue({ success: true, message: '注销成功' }),
  };
  const accountManager = {
    getAccountById: jest.fn(
      (id: string) => currentConfig.accounts.find(account => account.id === id) ?? null
    ),
    getCurrentAccount: jest.fn(
      () =>
        currentConfig.accounts.find(account => account.id === currentConfig.currentAccountId) ??
        null
    ),
  };
  const services = {
    authService,
    configManager,
    accountManager,
    wifiManager: {},
    networkDetector: {},
    logger: { stopAutoCleanup: jest.fn() },
  } as unknown as MobileServices;

  return { services, configManager, authService, getCurrentConfig: () => currentConfig };
}

describe('AppProvider', () => {
  let latest: ReturnType<typeof useApp> | undefined;

  function Consumer() {
    latest = useApp();
    return (
      <>
        <Text testID="current-account">{latest.currentAccount?.username ?? 'none'}</Text>
        <Text testID="account-count">{latest.accounts.length}</Text>
        <Text testID="logs">{latest.logs.map(log => log.message).join('\n')}</Text>
        <Text testID="network-status">{latest.networkStatus}</Text>
      </>
    );
  }

  beforeEach(() => {
    latest = undefined;
    jest.clearAllMocks();
    mockIsNativeModuleAvailable.mockReturnValue(true);
    mockHasLocationPermission.mockResolvedValue(true);
    mockRequestLocationPermission.mockResolvedValue(true);
    mockGetNetworkInfo.mockResolvedValue({
      wifiEnabled: true,
      connected: true,
      ssid: 'TUST-WIFI',
      ipv4: '10.1.2.3',
      ipv6: null,
      mac: null,
    });
    mockUseAutoAuth.mockReset();
    mockUsePermissionGuide.mockReturnValue({
      items: [],
      request: jest.fn(),
      runGuide: jest.fn(),
    });
  });

  it('加载配置后同步 accounts 与 currentAccount，并在 setConfig 时保持一致', async () => {
    const config = makeConfig();
    const { services, configManager } = createServices(config);
    mockCreateMobileServices.mockReturnValue(services);

    render(
      <AppProvider>
        <Consumer />
      </AppProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('current-account').props.children).toBe('20250001')
    );
    expect(screen.getByTestId('account-count').props.children).toBe(2);

    const next = {
      ...config,
      currentAccountId: secondAccount.id,
    };
    await act(async () => {
      latest?.setConfig(next);
    });

    expect(configManager.update).toHaveBeenCalledWith({ currentAccountId: secondAccount.id });
    expect(screen.getByTestId('current-account').props.children).toBe('20250002');
  });

  it('保存失败时写入可见错误日志', async () => {
    const config = makeConfig();
    const { services, configManager } = createServices(config);
    configManager.update.mockRejectedValueOnce(new Error('磁盘不可用'));
    mockCreateMobileServices.mockReturnValue(services);

    render(
      <AppProvider>
        <Consumer />
      </AppProvider>
    );

    await waitFor(() => expect(screen.getByTestId('account-count').props.children).toBe(2));
    await act(async () => {
      latest?.setConfig({ ...config, currentAccountId: secondAccount.id });
    });

    await waitFor(() =>
      expect(screen.getByTestId('logs').props.children).toContain('保存配置失败: 磁盘不可用')
    );
  });

  it('连续函数式更新会合并状态并按顺序持久化', async () => {
    const config = makeConfig();
    const { services, configManager } = createServices(config);
    mockCreateMobileServices.mockReturnValue(services);

    render(
      <AppProvider>
        <Consumer />
      </AppProvider>
    );

    await waitFor(() => expect(screen.getByTestId('account-count').props.children).toBe(2));
    await act(async () => {
      latest?.setConfig(current => ({
        ...current,
        settings: { ...current.settings, autoReconnect: false },
      }));
      latest?.setConfig(current => ({
        ...current,
        settings: { ...current.settings, enableHeartbeat: false },
      }));
    });

    await waitFor(() => expect(configManager.update).toHaveBeenCalledTimes(2));
    const firstSaved = configManager.update.mock.calls[0][0] as AppConfig;
    const secondSaved = configManager.update.mock.calls[1][0] as AppConfig;
    expect(firstSaved.settings).toMatchObject({
      autoReconnect: false,
      enableHeartbeat: true,
    });
    expect(secondSaved.settings).toMatchObject({
      autoReconnect: false,
      enableHeartbeat: false,
    });
  });

  it('手动登录优先使用当前 WiFi 关联账号，而不是当前账号', async () => {
    const config = makeConfig();
    const { services, authService } = createServices(config);
    mockCreateMobileServices.mockReturnValue(services);

    render(
      <AppProvider>
        <Consumer />
      </AppProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('current-account').props.children).toBe('20250001')
    );
    await act(async () => {
      await latest?.login();
    });

    expect(authService.loginWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        userAccount: secondAccount.username,
        userPassword: secondAccount.password,
      })
    );
    expect(authService.loginWithAccounts).not.toHaveBeenCalled();
  });

  it('多个关联账号按配置顺序依次尝试登录', async () => {
    const config = makeConfig();
    config.wifiList[0].linkedAccountIds = [secondAccount.id, firstAccount.id];
    const { services, authService } = createServices(config);
    mockCreateMobileServices.mockReturnValue(services);

    render(
      <AppProvider>
        <Consumer />
      </AppProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('current-account').props.children).toBe('20250001')
    );
    await act(async () => {
      await latest?.login();
    });

    expect(authService.loginWithAccounts).toHaveBeenCalledWith(
      [
        expect.objectContaining({ id: secondAccount.id }),
        expect.objectContaining({ id: firstAccount.id }),
      ],
      expect.objectContaining({ wlanUserIp: '10.1.2.3' })
    );
    expect(screen.getByTestId('network-status').props.children).toBe('connected');
  });

  it('没有可用账户或 IP 时阻止登录并记录原因', async () => {
    const config = makeConfig();
    config.accounts = [];
    config.currentAccountId = null;
    config.wifiList[0].linkedAccountIds = [];
    const { services, authService } = createServices(config);
    mockCreateMobileServices.mockReturnValue(services);

    const firstRender = render(
      <AppProvider>
        <Consumer />
      </AppProvider>
    );

    await waitFor(() => expect(screen.getByTestId('account-count').props.children).toBe(0));
    await act(async () => {
      await latest?.login();
    });
    expect(screen.getByTestId('logs').props.children).toContain('请先选择账户');
    expect(authService.loginWithRetry).not.toHaveBeenCalled();
    firstRender.unmount();

    const ipConfig = makeConfig();
    const ipServices = createServices(ipConfig);
    mockCreateMobileServices.mockReturnValue(ipServices.services);
    mockGetNetworkInfo.mockResolvedValue({
      wifiEnabled: true,
      connected: true,
      ssid: 'TUST-WIFI',
      ipv4: null,
      ipv6: null,
      mac: null,
    });
    render(
      <AppProvider>
        <Consumer />
      </AppProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('current-account').props.children).toBe('20250001')
    );
    await act(async () => {
      await latest?.login();
    });
    expect(screen.getByTestId('logs').props.children).toContain('无法获取 IP 地址，请检查网络连接');
  });

  it('登录失败和登出成功会同步网络状态', async () => {
    const config = makeConfig();
    const { services, authService } = createServices(config);
    authService.loginWithRetry.mockResolvedValue({ success: false, message: '密码错误' });
    mockCreateMobileServices.mockReturnValue(services);

    render(
      <AppProvider>
        <Consumer />
      </AppProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId('current-account').props.children).toBe('20250001')
    );
    await act(async () => {
      await latest?.login();
    });
    expect(screen.getByTestId('network-status').props.children).toBe('disconnected');
    expect(screen.getByTestId('logs').props.children).toContain('登录失败: 密码错误');

    await act(async () => {
      await latest?.logout();
    });
    expect(authService.logout).toHaveBeenCalledWith('10.1.2.3');
    expect(screen.getByTestId('logs').props.children).toContain('登出成功');
  });
});
