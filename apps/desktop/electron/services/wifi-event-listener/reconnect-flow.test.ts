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

  it('断开的 WiFi 未开启自动连接时不重连', async () => {
    const { deps, connectToConfiguredNetwork } = setup([wifi('Lab', 2, false), wifi('TUST', 1)]);

    expect(await run(executeAutoReconnect('Lab', deps))).toBeNull();
    expect(connectToConfiguredNetwork).not.toHaveBeenCalled();
  });
});

describe('executeStartupAutoConnect', () => {
  const scan = (ssids: string[]) => ({ scanAvailableSsids: vi.fn(async () => ssids) });

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

  it('已连接已配置的 WiFi：不切换', async () => {
    const { deps, connectToConfiguredNetwork } = setup(
      [wifi('TUST', 1), wifi('Lab', 2)],
      { startupAutoConnect: true, keepCurrentConnection: false },
      ['TUST']
    );
    expect(await run(executeStartupAutoConnect('Lab', { ...deps, ...scan(['TUST']) }))).toBeNull();
    expect(connectToConfiguredNetwork).not.toHaveBeenCalled();
  });
});
