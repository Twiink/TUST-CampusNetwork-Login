import { renderHook, waitFor } from '@testing-library/react-native';
import { NativeModules } from 'react-native';
import { DEFAULT_APP_SETTINGS, type AppConfig } from '@repo/shared';
import { buildAutoAuthProfile } from '../src/native/AutoAuth';
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

describe('buildAutoAuthProfile', () => {
  it('只保留认证、WiFi 重连与通知所需字段，过滤缺少密码的账号', () => {
    const profile = buildAutoAuthProfile(baseConfig);

    expect(profile).toEqual({
      enabled: true,
      revision: 0,
      authPaused: false,
      currentAccountId: 'a1',
      accounts: [
        { id: 'a1', username: '23103421', password: 'pw1', isp: 'campus', serverUrl: '' },
        { id: 'a2', username: '23103421', password: 'pw2', isp: 'cucc', serverUrl: '' },
      ],
      // WiFi 密码供后台重连使用，原生层以 Keystore 加密落盘
      wifiRules: [
        {
          ssid: 'TUST-5G',
          requiresAuth: true,
          linkedAccountIds: ['a2'],
          password: 'secret',
          autoConnect: true,
          priority: 1,
        },
      ],
      heartbeatEnabled: DEFAULT_APP_SETTINGS.enableHeartbeat,
      failureThreshold: DEFAULT_APP_SETTINGS.heartbeatFailureThreshold,
      wifiRetries: DEFAULT_APP_SETTINGS.wifiReconnectRetries,
      wifiCooldownMinutes: DEFAULT_APP_SETTINGS.wifiReconnectCooldownMinutes,
      startupAutoConnect: DEFAULT_APP_SETTINGS.startupAutoConnect,
      keepCurrentConnection: DEFAULT_APP_SETTINGS.keepCurrentConnection,
      notifications: DEFAULT_APP_SETTINGS.notificationSettings,
    });
    // 账号/WiFi 以外的配置（如账号显示名、WiFi id、最近连接时间）不进入快照
    expect(JSON.stringify(profile)).not.toContain('lastConnectedAt');
    expect(JSON.stringify(profile)).not.toContain('"name"');
  });

  it('自动认证开关跟随 autoReconnect', () => {
    const disabled = buildAutoAuthProfile({
      ...baseConfig,
      settings: { ...baseConfig.settings, autoReconnect: false },
    });
    expect(disabled.enabled).toBe(false);
  });
});

describe('useAutoAuth', () => {
  const makeServicesRef = () => ({
    current: {
      configManager: { getConfig: () => baseConfig },
    } as unknown as MobileServices,
  });

  afterEach(() => {
    delete NativeModules.AutoAuthModule;
  });

  it('原生模块可用时同步配置并交给原生引擎检查', async () => {
    const autoAuthModule = {
      syncProfile: jest.fn().mockResolvedValue(true),
      checkNow: jest.fn().mockResolvedValue(null),
      getLastResult: jest.fn().mockResolvedValue(null),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    NativeModules.AutoAuthModule = autoAuthModule;
    const { unmount } = renderHook(() =>
      useAutoAuth({
        servicesRef: makeServicesRef(),
        config: baseConfig,
        accounts: baseConfig.accounts,
        currentAccount: baseConfig.accounts[0],
        ready: true,
        addLog: jest.fn(),
      })
    );

    await waitFor(() => expect(autoAuthModule.syncProfile).toHaveBeenCalled());
    const synced = JSON.parse(autoAuthModule.syncProfile.mock.calls[0][0]);
    expect(synced.enabled).toBe(true);
    expect(synced.accounts).toHaveLength(2);
    await waitFor(() => expect(autoAuthModule.checkNow).toHaveBeenCalledWith('foreground'));
    unmount();
  });

  it('原生模块不可用时走 JS 实现：需要认证且未联网才登录', async () => {
    const loginWithAccounts = jest.fn().mockResolvedValue({
      success: true,
      message: '登录成功',
      attempts: [],
    });
    jest
      .mocked(NativeModules.WifiModule.getNetworkInfo)
      .mockResolvedValue({ connected: true, ssid: 'TUST-5G', ipv4: '10.0.0.2', ipv6: null });
    const linkedAccount = baseConfig.accounts[1];
    const servicesRef = {
      current: {
        configManager: { getConfig: () => baseConfig },
        wifiManager: {
          resolveAuthRequirement: jest.fn().mockReturnValue({
            requiresAuth: true,
            isConfigured: true,
            hasLinkedAccount: true,
          }),
          getWifiBySsid: jest.fn().mockReturnValue(baseConfig.wifiList[0]),
        },
        accountManager: {
          getAccountById: jest.fn(
            (id: string) => baseConfig.accounts.find(a => a.id === id) ?? null
          ),
          getCurrentAccount: jest.fn().mockReturnValue(baseConfig.accounts[0]),
        },
        networkDetector: { checkConnectivity: jest.fn().mockResolvedValue(false) },
        authService: {
          loginWithAccounts,
          runExclusive: (action: () => Promise<unknown>) => action(),
        },
      } as unknown as MobileServices,
    };
    const addLog = jest.fn();
    const onAuthenticated = jest.fn();

    const { unmount } = renderHook(() =>
      useAutoAuth({
        servicesRef,
        config: baseConfig,
        accounts: baseConfig.accounts,
        currentAccount: baseConfig.accounts[0],
        ready: true,
        addLog,
        onAuthenticated,
      })
    );

    await waitFor(() => expect(loginWithAccounts).toHaveBeenCalledTimes(1));
    // 优先使用 WiFi 关联账号序列；IP 取自原生 getNetworkInfo（jest.setup 中为 10.0.0.2）
    expect(loginWithAccounts).toHaveBeenCalledWith(
      [linkedAccount],
      {
        wlanUserIp: '10.0.0.2',
        wlanUserIpv6: undefined,
      },
      { shouldContinue: expect.any(Function) }
    );
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled());
    expect(addLog).toHaveBeenCalledWith('success', '自动认证成功: 登录成功');
    unmount();
  });

  it('已联网（204）时不登录', async () => {
    const loginWithAccounts = jest.fn();
    const checkConnectivity = jest.fn().mockResolvedValue(true);
    const servicesRef = {
      current: {
        configManager: { getConfig: () => baseConfig },
        wifiManager: {
          resolveAuthRequirement: jest.fn().mockReturnValue({ requiresAuth: true }),
          getWifiBySsid: jest.fn().mockReturnValue(null),
        },
        accountManager: {
          getAccountById: jest.fn(),
          getCurrentAccount: jest.fn().mockReturnValue(baseConfig.accounts[0]),
        },
        networkDetector: { checkConnectivity },
        authService: {
          loginWithAccounts,
          runExclusive: (action: () => Promise<unknown>) => action(),
        },
      } as unknown as MobileServices,
    };

    const { unmount } = renderHook(() =>
      useAutoAuth({
        servicesRef,
        config: baseConfig,
        accounts: baseConfig.accounts,
        currentAccount: baseConfig.accounts[0],
        ready: true,
        addLog: jest.fn(),
      })
    );

    await waitFor(() => expect(checkConnectivity).toHaveBeenCalled());
    expect(loginWithAccounts).not.toHaveBeenCalled();
    unmount();
  });
});
