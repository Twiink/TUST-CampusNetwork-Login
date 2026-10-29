/**
 * WiFi 三阶段重连 / 启动自动连接测试：重试次数、顺序、冷却期与「保持当前连接」
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigManager, Logger, WifiConfig, WifiManager } from '@repo/shared';
import { DEFAULT_APP_SETTINGS } from '@repo/shared';
import {
  executeAutoReconnect,
  executeStartupAutoConnect,
  inCooldown,
  planReconnect,
  resolveRetriesPerWifi,
} from './reconnect-flow';
import type { WifiSwitcherService } from '../wifi-switcher';

const wifi = (ssid: string, priority: number, autoConnect = true): WifiConfig => ({
  id: ssid,
  ssid,
  password: 'pw',
  autoConnect,
  requiresAuth: false,
  linkedAccountIds: [],
  priority,
  lastConnectedAt: null,
});

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

function setup(
  wifiList: WifiConfig[],
  settings: Partial<typeof DEFAULT_APP_SETTINGS> = {},
  connectable: string[] = []
) {
  const wifiManager = { getWifiConfigs: () => wifiList } as unknown as WifiManager;
  const configManager = {
    getConfig: () => ({ settings: { ...DEFAULT_APP_SETTINGS, ...settings } }),
  } as unknown as ConfigManager;
  const connectToConfiguredNetwork = vi.fn(async (ssid: string) => connectable.includes(ssid));
  const wifiSwitcherService = {
    setConfiguredNetworks: vi.fn(),
    connectToConfiguredNetwork,
  } as unknown as WifiSwitcherService;
  const onAllFailed = vi.fn();
  const onReconnected = vi.fn(async () => undefined);
  const deps = {
    logger,
    wifiManager,
    wifiSwitcherService,
    configManager,
    onProgress: vi.fn(),
    onAllFailed,
    onReconnected,
    initialDelayMs: 0,
  };
  return { deps, connectToConfiguredNetwork, onAllFailed, onReconnected };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const run = async <T>(promise: Promise<T>): Promise<T> => {
  await vi.runAllTimersAsync();
  return promise;
};

describe('reconnect-flow 纯函数', () => {
  it('同名规则分别重试，并始终使用配置 ID', async () => {
    const rules = [
      { ...wifi('Campus', 1), id: 'first', security: 'open' },
      { ...wifi('Campus', 2), id: 'second', security: 'WPA2' },
    ];
    const { deps, connectToConfiguredNetwork } = setup(rules, { wifiReconnectRetries: 1 }, [
      'second',
    ]);
    await expect(run(executeAutoReconnect('Campus', deps))).resolves.toBe(true);
    expect(connectToConfiguredNetwork.mock.calls.map((call) => call[0])).toEqual([
      'first',
      'second',
    ]);
  });
  it('断开的 WiFi 排第一，其余按优先级', () => {
    const plan = planReconnect('Lab', [wifi('Home', 5), wifi('Lab', 8), wifi('TUST', 1)]);
    expect(plan.map((w) => w.ssid)).toEqual(['Lab', 'TUST', 'Home']);
    expect(planReconnect(null, [wifi('B', 3), wifi('A', 1)]).map((w) => w.ssid)).toEqual([
      'A',
      'B',
    ]);
  });

  it('冷却期判定，0 表示不冷却', () => {
    const five = 5 * 60_000;
    expect(inCooldown(0, five, 1_000_000)).toBe(false);
    expect(inCooldown(1_000_000, five, 1_000_000 + five - 1)).toBe(true);
    expect(inCooldown(1_000_000, five, 1_000_000 + five)).toBe(false);
    expect(inCooldown(1_000_000, 0, 1_000_001)).toBe(false);
  });

  it('单个 WiFi 重试次数读取新字段，至少 1 次', () => {
    const cm = (s: object) => ({ getConfig: () => ({ settings: s }) }) as unknown as ConfigManager;
    expect(resolveRetriesPerWifi(cm({ wifiReconnectRetries: 5 }))).toBe(5);
    expect(resolveRetriesPerWifi(cm({ wifiReconnectRetries: 0 }))).toBe(1);
    expect(resolveRetriesPerWifi(undefined)).toBe(3);
  });
});

describe('executeAutoReconnect', () => {
  it('按 wifiReconnectRetries 重试断开的 WiFi，再切到下一个', async () => {
    const { deps, connectToConfiguredNetwork, onReconnected } = setup(
      [wifi('Lab', 2), wifi('TUST', 1)],
      { wifiReconnectRetries: 2 },
      ['TUST']
    );

    const result = await run(executeAutoReconnect('Lab', deps));

    expect(result).toBe(true);
    expect(connectToConfiguredNetwork.mock.calls.map((c) => c[0])).toEqual(['Lab', 'Lab', 'TUST']);
    expect(onReconnected).toHaveBeenCalledWith('TUST');
  });

  it('全部失败返回 false 并广播失败列表', async () => {
    const { deps, onAllFailed } = setup([wifi('Lab', 2), wifi('TUST', 1)], {
      wifiReconnectRetries: 1,
    });

    expect(await run(executeAutoReconnect('Lab', deps))).toBe(false);
    expect(onAllFailed.mock.calls[0][0].map((f: { ssid: string }) => f.ssid)).toEqual([
      'Lab',
      'TUST',
    ]);
  });

  it('断开的 WiFi 未开启自动连接时跳过该网络，仍尝试开启的备用网络', async () => {
    const { deps, connectToConfiguredNetwork } = setup(
      [wifi('Lab', 2, false), wifi('TUST', 1)],
      {},
      ['TUST']
    );

    expect(await run(executeAutoReconnect('Lab', deps))).toBe(true);
    expect(connectToConfiguredNetwork.mock.calls.map((call) => call[0])).toEqual(['TUST']);
  });
});

describe('executeStartupAutoConnect', () => {
  const scan = (ssids: string[]) => ({ scanAvailableSsids: vi.fn(async () => ssids) });

  it('连接期间取消后不发布成功', async () => {
    const { deps, connectToConfiguredNetwork, onReconnected } = setup([wifi('TUST', 1)], {
      startupAutoConnect: true,
      keepCurrentConnection: false,
    });
    let finish!: (connected: boolean) => void;
    connectToConfiguredNetwork.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    let active = true;
    const pending = executeStartupAutoConnect('Cafe', {
      ...deps,
      ...scan(['TUST']),
      shouldContinue: () => active,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(connectToConfiguredNetwork).toHaveBeenCalledOnce();
    active = false;
    finish(true);
    expect(await pending).toBeNull();
    expect(onReconnected).not.toHaveBeenCalled();
  });

  it('设置关闭时不做任何事', async () => {
    const { deps, connectToConfiguredNetwork } = setup([wifi('TUST', 1)], {}, ['TUST']);
    expect(await run(executeStartupAutoConnect(null, { ...deps, ...scan([]) }))).toBeNull();
    expect(connectToConfiguredNetwork).not.toHaveBeenCalled();
  });

  it('未连接 WiFi 时按优先级连接', async () => {
    const { deps, connectToConfiguredNetwork } = setup(
      [wifi('Home', 5), wifi('TUST', 1)],
      { startupAutoConnect: true },
      ['TUST']
    );
    expect(await run(executeStartupAutoConnect(null, { ...deps, ...scan([]) }))).toBe(true);
    expect(connectToConfiguredNetwork).toHaveBeenCalledWith('TUST');
  });

  it('已连接其他 WiFi 且保持当前连接：不切换', async () => {
    const { deps, connectToConfiguredNetwork } = setup(
      [wifi('TUST', 1)],
      { startupAutoConnect: true, keepCurrentConnection: true },
      ['TUST']
    );
    expect(await run(executeStartupAutoConnect('Cafe', { ...deps, ...scan(['TUST']) }))).toBeNull();
    expect(connectToConfiguredNetwork).not.toHaveBeenCalled();
  });

  it('已连接其他 WiFi 且不保持：切换到附近最高优先级的已配置 WiFi', async () => {
    const { deps, connectToConfiguredNetwork } = setup(
      [wifi('TUST', 1), wifi('Lab', 2)],
      { startupAutoConnect: true, keepCurrentConnection: false },
      ['Lab']
    );
    // TUST 优先级更高但不在附近
    expect(await run(executeStartupAutoConnect('Cafe', { ...deps, ...scan(['Lab']) }))).toBe(true);
    expect(connectToConfiguredNetwork).toHaveBeenCalledWith('Lab');
  });

  it('已连接已配置的 WiFi 且不保持：仍选择附近最高优先级', async () => {
    const { deps, connectToConfiguredNetwork } = setup(
      [wifi('TUST', 1), wifi('Lab', 2)],
      { startupAutoConnect: true, keepCurrentConnection: false },
      ['TUST']
    );
    expect(await run(executeStartupAutoConnect('Lab', { ...deps, ...scan(['TUST']) }))).toBe(true);
    expect(connectToConfiguredNetwork).toHaveBeenCalledWith('TUST');
  });
});

describe('功能完善回归', () => {
  it('N1: 门户成功但不可联网只认证一次，再进入备用网络', async () => {
    const { deps, onReconnected, onAllFailed } = setup(
      [wifi('Campus', 5), wifi('Backup', 1)],
      { wifiReconnectRetries: 3 },
      ['Campus', 'Backup']
    );
    const verify = vi.fn(async (target: WifiConfig) => ({
      online: target.id === 'Backup',
      authenticated: target.id === 'Campus',
      retryable: false,
      reason: '已认证但互联网不可达',
    }));
    expect(
      await run(executeAutoReconnect('Campus', { ...deps, currentWifiId: 'Campus', verify }))
    ).toBe(true);
    expect(verify.mock.calls.map((call) => call[0].id)).toEqual(['Campus', 'Backup']);
    expect(onReconnected).toHaveBeenCalledExactlyOnceWith('Backup');
    expect(onAllFailed).not.toHaveBeenCalled();
  });
  it('普通热点达到联网确认阈值后也切换，认证失败才消耗重试次数', async () => {
    const { deps, connectToConfiguredNetwork } = setup(
      [wifi('Hotspot', 5), wifi('Backup', 1)],
      { wifiReconnectRetries: 3 },
      ['Hotspot', 'Backup']
    );
    const verify = vi.fn(async (target: WifiConfig) => ({
      online: target.id === 'Backup',
      authenticated: false,
      retryable: false,
    }));
    expect(await run(executeAutoReconnect('Hotspot', { ...deps, verify }))).toBe(true);
    expect(connectToConfiguredNetwork.mock.calls.map((call) => call[0])).toEqual([
      'Hotspot',
      'Backup',
    ]);
    const second = setup([wifi('Campus', 1)], { wifiReconnectRetries: 2 }, ['Campus']);
    const reject = vi.fn(async () => ({ online: false, authenticated: false, retryable: true }));
    expect(await run(executeAutoReconnect('Campus', { ...second.deps, verify: reject }))).toBe(
      false
    );
    expect(reject).toHaveBeenCalledTimes(2);
  });
  it('同名规则按断线前的配置 ID 优先，关闭该规则后只尝试其他开启的规则', async () => {
    const rules = [
      { ...wifi('Campus', 1), id: 'open' },
      { ...wifi('Campus', 5), id: 'secure' },
    ];
    expect(planReconnect('Campus', rules, 'secure').map((rule) => rule.id)).toEqual([
      'secure',
      'open',
    ]);
    const { deps, connectToConfiguredNetwork } = setup(
      [{ ...rules[1], autoConnect: false }, rules[0]],
      {},
      ['open']
    );
    expect(await run(executeAutoReconnect('Campus', { ...deps, currentWifiId: 'secure' }))).toBe(
      true
    );
    expect(connectToConfiguredNetwork.mock.calls.map((call) => call[0])).toEqual(['open']);
  });
  it('优先级相同时保留用户配置顺序', () => {
    expect(planReconnect(null, [wifi('Z', 1), wifi('A', 1)]).map((rule) => rule.id)).toEqual([
      'Z',
      'A',
    ]);
  });
});
