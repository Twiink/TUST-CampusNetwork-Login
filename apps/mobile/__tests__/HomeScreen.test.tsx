import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NativeModules } from 'react-native';
import { createDefaultAppConfig, type AccountConfig, type AppConfig } from '@repo/shared';
import { HomeScreen } from '../src/screens/HomeScreen';
import { useApp } from '../src/context/AppContext';

jest.mock('../src/context/AppContext', () => ({
  useApp: jest.fn(),
}));

const mockUseApp = useApp as jest.Mock;

jest.mock('../src/context/ThemeContext', () => {
  const { getTheme } = jest.requireActual('../src/constants/theme');
  return {
    useTheme: () => ({ theme: getTheme('dark'), themeMode: 'dark' }),
  };
});

const nativeWifi = NativeModules.WifiModule as Record<string, jest.Mock>;

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

function makeConfig(linkedAccountIds: string[] = [secondAccount.id]): AppConfig {
  return {
    ...createDefaultAppConfig(),
    accounts: [firstAccount, secondAccount],
    currentAccountId: firstAccount.id,
    wifiList: [
      {
        id: 'w1',
        ssid: 'TUST-WIFI',
        password: '',
        autoConnect: true,
        requiresAuth: true,
        linkedAccountIds,
        linkedAccountId: linkedAccountIds[0],
        priority: 10,
        lastConnectedAt: null,
      },
    ],
  };
}

function renderHome(config = makeConfig(), overrides: Record<string, unknown> = {}) {
  const login = jest.fn();
  const logout = jest.fn();
  mockUseApp.mockReturnValue({
    networkStatus: 'disconnected',
    ipAddress: '10.1.2.3',
    login,
    logout,
    config,
    ...overrides,
  });
  return { ...render(<HomeScreen />), login, logout };
}

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    nativeWifi.getNetworkInfo.mockResolvedValue({
      wifiEnabled: true,
      connected: true,
      ssid: 'TUST-WIFI',
      ipv4: '10.1.2.3',
      ipv6: null,
      mac: null,
    });
  });

  it('未连接 WiFi 时显示提示，不暴露无效的登录按钮', async () => {
    nativeWifi.getNetworkInfo.mockResolvedValue({
      wifiEnabled: false,
      connected: false,
      ssid: null,
      ipv4: null,
      ipv6: null,
      mac: null,
    });
    renderHome();

    expect(await screen.findByText('未连接 WiFi')).toBeTruthy();
    expect(screen.queryByText('立即连接')).toBeNull();
  });

  it('当前 WiFi 未配置时引导用户去配置', async () => {
    const config = makeConfig();
    config.wifiList = [];
    renderHome(config);

    expect(await screen.findByText('该 WiFi 未配置')).toBeTruthy();
    expect(screen.getAllByText(/TUST-WIFI/).length).toBeGreaterThan(0);
  });

  it('认证 WiFi 无关联账号时提示配置账号', async () => {
    renderHome(makeConfig([]));

    expect(await screen.findByText('未配置账户')).toBeTruthy();
    expect(screen.queryByText('立即连接')).toBeNull();
  });

  it('无需认证的 WiFi 不显示登录或断开操作', async () => {
    const config = makeConfig([]);
    config.wifiList[0].requiresAuth = false;
    renderHome(config);

    expect(await screen.findByText('无需认证')).toBeTruthy();
    expect(screen.queryByText('立即连接')).toBeNull();
    expect(screen.queryByText('断开连接')).toBeNull();
  });

  it('按 linkedAccountIds 顺序展示关联账号', async () => {
    renderHome(makeConfig([secondAccount.id]));

    expect(await screen.findByText('20250002')).toBeTruthy();
    expect(screen.queryByText('20250001')).toBeNull();
  });

  it('兼容旧版 linkedAccountId 关联字段', async () => {
    const config = makeConfig([]);
    config.wifiList[0].linkedAccountId = secondAccount.id;
    renderHome(config);

    expect(await screen.findByText('20250002')).toBeTruthy();
    expect(screen.queryByText('未配置账户')).toBeNull();
  });

  it('连接按钮会触发登录，断开按钮会触发注销', async () => {
    const { login } = renderHome(makeConfig(), { networkStatus: 'disconnected' });
    fireEvent.press(await screen.findByText('立即连接'));
    expect(login).toHaveBeenCalledTimes(1);

    const { logout } = renderHome(makeConfig(), { networkStatus: 'connected' });
    fireEvent.press(await screen.findByText('断开连接'));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('连接中禁用重复操作', async () => {
    renderHome(makeConfig(), { networkStatus: 'connecting' });
    await screen.findByText('正在连接...');

    expect(screen.getByLabelText('正在连接...').props.accessibilityState?.disabled).toBe(true);
  });

  it('刷新 WiFi 信息时防止短时间重复请求', async () => {
    const config = makeConfig();
    config.wifiList[0].requiresAuth = false;
    renderHome(config);
    await waitFor(() => expect(nativeWifi.getNetworkInfo).toHaveBeenCalled());
    const callsBeforeRefresh = nativeWifi.getNetworkInfo.mock.calls.length;

    fireEvent.press(screen.getByText('🔄'));
    fireEvent.press(screen.getByText('🔄'));

    await waitFor(() =>
      expect(nativeWifi.getNetworkInfo.mock.calls.length).toBeGreaterThan(callsBeforeRefresh)
    );
    expect(nativeWifi.getNetworkInfo.mock.calls.length).toBe(callsBeforeRefresh + 1);
  });
});
