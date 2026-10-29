/**
 * AutoReconnectService 状态驱动自愈与触发守卫测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@repo/shared';
import type { LoginResult, MultiAccountLoginResult, NetworkStatus } from '@repo/shared';
import type { AccountConfig } from '@repo/shared';

const resolveNetworkInfoMock = vi.fn();

vi.mock('./network', () => ({
  resolveNetworkInfo: (...args: unknown[]) => resolveNetworkInfoMock(...args),
}));

import { AutoReconnectService } from './auto-reconnect';

const logger = createLogger(100, 1);

const onlineStatus = (overrides: Partial<NetworkStatus> = {}): NetworkStatus => ({
  connected: true,
  authenticated: true,
  wifiConnected: true,
  ssid: 'TUST-Dorm',
  ip: '10.1.2.3',
  requiresAuth: true,
  ...overrides,
});

const offlineAuthRequired: NetworkStatus = {
  connected: false,
  authenticated: false,
  wifiConnected: true,
  ssid: 'TUST-Dorm',
  ip: '10.1.2.3',
  requiresAuth: true,
};

function createService(
  overrides: {
    loginResult?: MultiAccountLoginResult | LoginResult;
    currentAccount?: AccountConfig | null;
    failureThreshold?: number;
    onReconnectSuccess?: (info: { recovered: boolean }) => void;
  } = {}
) {
  const loginWithAccounts = vi.fn().mockResolvedValue(
    overrides.loginResult ?? {
      success: true,
      message: '登录成功',
      attempts: [],
    }
  );
  const authService = {
    loginWithAccounts,
    runExclusive: <T>(action: () => Promise<T>) => action(),
  } as never;

  const currentAccount =
    overrides.currentAccount === undefined
      ? ({
          id: 'acc-1',
          name: '账号一',
          username: '20260001',
          password: 'secret',
          serverUrl: 'http://10.10.102.50:801',
          isp: 'campus',
        } as AccountConfig)
      : overrides.currentAccount;
  const accountManager = {
    getCurrentAccount: vi.fn(() => currentAccount),
    getAccountById: vi.fn(() => null),
  } as never;

  const service = new AutoReconnectService(
    authService,
    accountManager,
    logger,
    {
      maxRetries: 0, // 成功路径首轮即中，避免真实退避等待
      initialDelay: 1,
      failureThreshold: overrides.failureThreshold ?? 1,
    },
    { onReconnectSuccess: overrides.onReconnectSuccess }
  );

  return { service, loginWithAccounts };
}

describe('AutoReconnectService 触发逻辑', () => {
  beforeEach(() => {
    resolveNetworkInfoMock.mockReset();
    resolveNetworkInfoMock.mockResolvedValue({
      ipv4: '10.1.2.3',
      ipv6: '2409:8800::1',
      mac: 'aabbccddeeff',
    });
  });

  it('边沿触发保留：已连接 → 断开（需认证 WiFi）应触发重连', async () => {
    const { service, loginWithAccounts } = createService();

    await service.handleStatusChange(onlineStatus());
    expect(loginWithAccounts).not.toHaveBeenCalled();

    await service.handleStatusChange(offlineAuthRequired);
    expect(loginWithAccounts).toHaveBeenCalledTimes(1);
  });

  it('状态驱动自愈：之前已离线（非跳变）且 WiFi 需认证时仍应触发重连', async () => {
    const { service, loginWithAccounts } = createService();

    // 第一轮：冷启动即离线，但 WiFi 无需认证（家庭 WiFi）→ 不触发，仅记录状态
    await service.handleStatusChange({
      connected: false,
      authenticated: false,
      wifiConnected: true,
      ssid: 'Home',
      requiresAuth: false,
    });
    expect(loginWithAccounts).not.toHaveBeenCalled();

    // 第二轮：同一会话内切到需认证的校园 WiFi 且未联网。
    // 非首轮、之前也是离线 → 只有状态驱动路径能触发
    await service.handleStatusChange(offlineAuthRequired);
    expect(loginWithAccounts).toHaveBeenCalledTimes(1);
  });

  it('持续离线的后续心跳应每个周期继续自愈（对齐参考实现语义）', async () => {
    const { service, loginWithAccounts } = createService({
      // 第一轮失败、第二轮成功，验证失败后不放弃
      loginResult: undefined,
    });
    let call = 0;
    loginWithAccounts.mockImplementation(async () => {
      call += 1;
      return call === 1
        ? { success: false, message: 'IP 未就绪', attempts: [] }
        : { success: true, message: '登录成功', attempts: [] };
    });

    await service.handleStatusChange(offlineAuthRequired);
    // 首轮失败：retryPolicy maxRetries=0 → 单次尝试即失败结束
    expect(loginWithAccounts).toHaveBeenCalledTimes(1);

    // 下一心跳周期仍离线 → 再次触发并成功
    await service.handleStatusChange(offlineAuthRequired);
    expect(loginWithAccounts).toHaveBeenCalledTimes(2);
  });

  it('WiFi 无需认证（家庭 WiFi/热点）时持续离线不应触发认证重连', async () => {
    const { service, loginWithAccounts } = createService();
    const offlineNoAuth: NetworkStatus = {
      connected: false,
      authenticated: false,
      wifiConnected: true,
      ssid: 'Home-WiFi',
      requiresAuth: false,
    };

    await service.handleStatusChange(offlineNoAuth);
    await service.handleStatusChange(offlineNoAuth);
    await service.handleStatusChange(offlineNoAuth);

    expect(loginWithAccounts).not.toHaveBeenCalled();
  });

  it('无可用账号时应静默跳过，不触发登录', async () => {
    const { service, loginWithAccounts } = createService({ currentAccount: null });

    await service.handleStatusChange(offlineAuthRequired);
    await service.handleStatusChange(offlineAuthRequired);

    expect(loginWithAccounts).not.toHaveBeenCalled();
  });

  it('连续失败阈值：已在线后心跳连续离线达到阈值才重新认证', async () => {
    const { service, loginWithAccounts } = createService({ failureThreshold: 3 });

    await service.handleStatusChange(onlineStatus());
    await service.handleStatusChange(offlineAuthRequired);
    await service.handleStatusChange(offlineAuthRequired);
    expect(loginWithAccounts).not.toHaveBeenCalled();

    await service.handleStatusChange(offlineAuthRequired);
    expect(loginWithAccounts).toHaveBeenCalledTimes(1);
  });

  it('连续失败阈值：中间恢复在线会清零计数', async () => {
    const { service, loginWithAccounts } = createService({ failureThreshold: 2 });

    await service.handleStatusChange(onlineStatus());
    await service.handleStatusChange(offlineAuthRequired);
    await service.handleStatusChange(onlineStatus());
    await service.handleStatusChange(offlineAuthRequired);
    expect(loginWithAccounts).not.toHaveBeenCalled();
  });

  it('WiFi 事件触发与冷启动不受阈值限制', async () => {
    const { service, loginWithAccounts } = createService({ failureThreshold: 5 });

    // 冷启动未曾在线：立即认证
    await service.handleStatusChange(offlineAuthRequired);
    expect(loginWithAccounts).toHaveBeenCalledTimes(1);

    // 已在线后由 WiFi 事件确认离线：立即认证
    await service.handleStatusChange(onlineStatus());
    await service.handleStatusChange(offlineAuthRequired, 'network');
    expect(loginWithAccounts).toHaveBeenCalledTimes(2);
  });

  it('只有已在线后掉线再认证成功才报告「认证恢复」', async () => {
    const onReconnectSuccess = vi.fn();
    const { service } = createService({ onReconnectSuccess });

    await service.handleStatusChange(offlineAuthRequired);
    expect(onReconnectSuccess).toHaveBeenLastCalledWith({ recovered: false });

    await service.handleStatusChange(onlineStatus());
    await service.handleStatusChange(offlineAuthRequired);
    expect(onReconnectSuccess).toHaveBeenLastCalledWith({ recovered: true });
  });

  it('切换到另一个 WiFi 后在线记录清零，不沿用旧连接的阈值', async () => {
    const { service, loginWithAccounts } = createService({ failureThreshold: 3 });

    await service.handleStatusChange(onlineStatus({ ssid: 'TUST-Lab' }));
    await service.handleStatusChange(offlineAuthRequired);
    expect(loginWithAccounts).toHaveBeenCalledTimes(1);
  });
});
