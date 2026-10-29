import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultAppConfig, type AppConfig, type NetworkStatus } from '@repo/shared';
import { Home } from './Home';

const { useAppMock, useHeartbeatMock, useWifiReconnectMock } = vi.hoisted(() => ({
  useAppMock: vi.fn(),
  useHeartbeatMock: vi.fn(),
  useWifiReconnectMock: vi.fn(),
}));

vi.mock('../context/AppContext', () => ({
  useApp: useAppMock,
}));

vi.mock('../hooks/useHeartbeat', () => ({
  useHeartbeat: useHeartbeatMock,
}));

vi.mock('../hooks/useWifiReconnect', () => ({
  useWifiReconnect: useWifiReconnectMock,
}));

const networkStatus: NetworkStatus = {
  connected: false,
  authenticated: false,
  wifiConnected: true,
  ssid: 'TUST-WIFI',
  signalStrength: 80,
  linkSpeed: 300,
  frequency: 5000,
  ip: '10.1.2.3',
  mac: '00:11:22:33:44:55',
};

const account = {
  id: 'a1',
  name: '账号一',
  username: '20250001',
  password: 'secret',
  serverUrl: 'http://10.10.102.50:801',
  isp: 'campus' as const,
};

function makeConfig(): AppConfig {
  return {
    ...createDefaultAppConfig(),
    accounts: [account],
    currentAccountId: account.id,
    wifiList: [
      {
        id: 'w1',
        ssid: 'TUST-WIFI',
        password: 'wifi-pass',
        autoConnect: true,
        requiresAuth: true,
        linkedAccountIds: [account.id],
        linkedAccountId: account.id,
        priority: 1,
        lastConnectedAt: null,
      },
    ],
  };
}

function renderHome(overrides: Record<string, unknown> = {}, config = makeConfig()) {
  useAppMock.mockReturnValue({
    networkStatus: 'disconnected',
    login: vi.fn(),
    logout: vi.fn(),
    config,
    status: networkStatus,
    wifiConnected: true,
    wifiSSID: 'TUST-WIFI',
    fetchStatus: vi.fn().mockResolvedValue(undefined),
    loading: false,
    initialCheckDone: true,
    ...overrides,
  });
  return render(<Home />);
}

describe('Home', () => {
  beforeEach(() => {
    useAppMock.mockReset();
    useHeartbeatMock.mockReset();
    useWifiReconnectMock.mockReset();
    useHeartbeatMock.mockReturnValue({
      heartbeat: {
        remainingSeconds: 20,
        totalSeconds: 30,
        connected: true,
        authenticated: true,
        latency: null,
        lastCheckTime: Date.now(),
      },
      reconnectProgress: {
        status: 'idle',
        currentAttempt: 0,
        maxAttempts: 3,
        message: '',
      },
    });
    useWifiReconnectMock.mockReturnValue({
      isReconnecting: false,
      progress: null,
      allFailed: null,
      clearAllFailed: vi.fn(),
    });
    vi.mocked(window.electronAPI.wifi.switch).mockResolvedValue(true);
  });

  it('初始检测完成且非加载态后才展示状态页', () => {
    const { rerender } = renderHome({ initialCheckDone: false });
    expect(screen.getByText('正在检测 WiFi 连接...')).toBeTruthy();

    renderHome({ loading: true });
    expect(screen.getByText('正在获取 WiFi 详情...')).toBeTruthy();

    rerender(<div />);
  });

  it('未连接 WiFi 时展示连接提示且不提供无效断开按钮', () => {
    renderHome({ wifiConnected: false, wifiSSID: null, networkStatus: 'disconnected' });

    expect(screen.getByText('未连接 WiFi')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '断开连接' })).toBeNull();
  });

  it('当前 WiFi 未配置时展示配置引导', () => {
    const config = makeConfig();
    config.wifiList = [];
    renderHome({}, config);

    expect(screen.getByText('该 WiFi 未配置')).toBeTruthy();
    expect(screen.getAllByText(/TUST-WIFI/).length).toBeGreaterThan(0);
  });

  it('无需认证时展示绿通提示，不显示登录或断开操作', () => {
    const config = makeConfig();
    config.wifiList[0].requiresAuth = false;
    config.wifiList[0].linkedAccountIds = [];
    config.wifiList[0].linkedAccountId = undefined;
    renderHome({}, config);

    expect(screen.getByText('无需认证')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '立即连接' })).toBeNull();
    expect(screen.queryByRole('button', { name: '断开连接' })).toBeNull();
  });

  it('仅存在 linkedAccountIds 时也能识别关联账号', () => {
    const config = makeConfig();
    config.wifiList[0].linkedAccountId = undefined;
    renderHome({ networkStatus: 'disconnected' }, config);

    expect(screen.getByText('需要认证')).toBeTruthy();
    expect(screen.queryByText('未配置账户')).toBeNull();
    expect(screen.getByRole('button', { name: '立即连接' })).toBeTruthy();
  });

  it('认证 WiFi 无有效关联账号时使用当前账号', () => {
    const config = makeConfig();
    config.wifiList[0].linkedAccountIds = [];
    config.wifiList[0].linkedAccountId = undefined;
    renderHome({}, config);

    expect(screen.getByRole('button', { name: '立即连接' })).toBeTruthy();
  });

  it('断线、在线和认证中分别提供正确操作状态', () => {
    const login = vi.fn();
    const { rerender } = renderHome({ networkStatus: 'disconnected', login });
    fireEvent.click(screen.getByRole('button', { name: '立即连接' }));
    expect(login).toHaveBeenCalledTimes(1);

    const logout = vi.fn();
    renderHome({
      networkStatus: 'connected',
      status: { ...networkStatus, connected: true, authenticated: true },
      logout,
    });
    fireEvent.click(screen.getByRole('button', { name: '断开连接' }));
    expect(logout).toHaveBeenCalledTimes(1);

    renderHome({ networkStatus: 'connecting' });
    expect(
      (screen.getByRole('button', { name: '正在认证...' }) as HTMLButtonElement).disabled
    ).toBe(true);

    rerender(<div />);
  });

  it('刷新 WiFi 信息后显示成功提示并防止即时重复刷新', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(undefined);
    renderHome({ fetchStatus });

    const refresh = screen.getByTitle('刷新 WiFi 信息');
    fireEvent.click(refresh);
    fireEvent.click(refresh);

    expect(await screen.findByText('WiFi 信息已更新')).toBeTruthy();
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('刷新异常时显示错误提示', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchStatus = vi.fn().mockRejectedValue(new Error('读取失败'));
    renderHome({ fetchStatus });

    fireEvent.click(screen.getByTitle('刷新 WiFi 信息'));

    expect(await screen.findByText('刷新失败，请重试')).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('同名 WiFi 仅标记实际匹配的规则，并按选中配置 ID 切换', async () => {
    const config = makeConfig();
    config.wifiList[0].security = 'open';
    config.wifiList.push({ ...config.wifiList[0], id: 'secure-campus', security: 'WPA2' });
    renderHome({ status: { ...networkStatus, security: 'open' } }, config);
    const target = screen.getByText('WPA2').closest('button')!;
    expect(target.disabled).toBe(false);
    fireEvent.click(target);
    await screen.findByText('正在切换到 TUST-WIFI，请稍候...');
    expect(window.electronAPI.wifi.switch).toHaveBeenCalledWith('secure-campus');
  });

  it('多 WiFi 时支持切换，失败与异常均有反馈', async () => {
    const config = makeConfig();
    config.wifiList.push({
      ...config.wifiList[0],
      id: 'w2',
      ssid: 'TUST-LAB',
      priority: 2,
    });
    const fetchStatus = vi.fn().mockResolvedValue(undefined);
    renderHome({ fetchStatus }, config);

    fireEvent.click(screen.getByText('TUST-LAB').closest('button')!);
    expect(await screen.findByText('正在切换到 TUST-LAB，请稍候...')).toBeTruthy();
    expect(window.electronAPI.wifi.switch).toHaveBeenCalledWith('w2');

    await new Promise((resolve) => setTimeout(resolve, 1100));
    vi.mocked(window.electronAPI.wifi.switch).mockResolvedValueOnce(false);
    fireEvent.click(screen.getByText('TUST-LAB').closest('button')!);
    expect(await screen.findByText('切换到 TUST-LAB 失败，请重试')).toBeTruthy();
  });

  it('WiFi 切换 IPC 异常时显示通用错误', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const config = makeConfig();
    config.wifiList.push({
      ...config.wifiList[0],
      id: 'w2',
      ssid: 'TUST-LAB',
      priority: 2,
    });
    vi.mocked(window.electronAPI.wifi.switch).mockRejectedValueOnce(new Error('命令失败'));
    renderHome({}, config);

    fireEvent.click(screen.getByText('TUST-LAB').closest('button')!);
    expect(await screen.findByText('WiFi切换失败，请检查网络设置')).toBeTruthy();
    consoleError.mockRestore();
  });
  it('R5: 断网且只有一个关闭自动连接的配置时，仍可手动连接', async () => {
    const config = makeConfig();
    config.wifiList[0].autoConnect = false;
    renderHome({ wifiConnected: false, wifiSSID: null }, config);
    fireEvent.click(screen.getByText('TUST-WIFI').closest('button')!);
    expect(window.electronAPI.wifi.switch).toHaveBeenCalledWith('w1');
    expect(await screen.findByText('正在切换到 TUST-WIFI，请稍候...')).toBeTruthy();
  });
  it('R7: 未保存规则的校园网按认证策略提供登录与注销', () => {
    const config = makeConfig();
    config.wifiList = [];
    const first = renderHome({ status: { ...networkStatus, requiresAuth: true } }, config);
    expect(screen.getByRole('button', { name: '立即连接' })).toBeTruthy();
    first.unmount();
    renderHome(
      {
        status: { ...networkStatus, requiresAuth: true, authenticated: true },
        networkStatus: 'disconnected',
      },
      config
    );
    expect(screen.getByRole('button', { name: '断开连接' })).toBeTruthy();
  });
  it('无账号的校园网直接提供添加账号入口', () => {
    const config = makeConfig();
    config.wifiList = [];
    config.accounts = [];
    config.currentAccountId = null;
    renderHome({ status: { ...networkStatus, requiresAuth: true } }, config).unmount();
    const configure = vi.fn();
    render(<Home onConfigure={configure} />);
    fireEvent.click(screen.getByRole('button', { name: '添加认证账号' }));
    expect(configure).toHaveBeenCalledTimes(1);
  });
});
