import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  ConfigManager,
  AccountManager,
  AuthService,
  MemoryStorageAdapter,
  WifiManager,
  createDefaultAppConfig,
  createLogger,
  type AppSettings,
} from '@repo/shared';

const boundary = vi.hoisted(() => ({
  ssid: 'A' as string | null,
  enabled: true,
  handlers: new Map<string, (...args: never[]) => Promise<unknown>>(),
  rendererListeners: new Map<string, (...args: unknown[]) => void>(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, callback: (...args: never[]) => Promise<unknown>) =>
      boundary.handlers.set(name, callback),
  },
  BrowserWindow: class {},
}));
vi.mock('@repo/native', () => ({ watchNetwork: () => false }));
vi.mock('./wifi-event-listener/ssid-probe', () => ({
  probeCurrentSsid: async () => boundary.ssid,
}));
import { WifiSwitcherService } from './wifi-switcher';
import { WifiEventListener } from './wifi-event-listener';
import { AutoReconnectService } from './auto-reconnect';
import { registerWifiIPC } from '../ipc/wifi';
import { IPC_CHANNELS } from '../ipc/channels';
import { useWifiReconnect } from '../../src/hooks/useWifiReconnect';

let listener: WifiEventListener | undefined;
afterEach(() => {
  cleanup();
  listener?.stop();
  boundary.rendererListeners.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const rule = (id: string) => ({
  id,
  ssid: id,
  password: '',
  autoConnect: true,
  requiresAuth: false,
  linkedAccountIds: [],
  priority: id === 'A' ? 1 : 2,
  lastConnectedAt: null,
});
async function setup(
  connect: (ssid: string) => Promise<boolean>,
  settings: Partial<AppSettings> = {},
  initialSsid: string | null = 'A',
  options: {
    isOnline?: (ssid: string | null) => boolean;
    campus?: boolean;
    auth?: AuthService;
  } = {}
) {
  vi.useFakeTimers();
  boundary.ssid = initialSsid;
  boundary.enabled = true;
  const storage = new MemoryStorageAdapter();
  const initial = createDefaultAppConfig({ wifiList: [rule('A'), rule('B')] });
  if (options.campus) {
    initial.wifiList[0].requiresAuth = true;
    initial.accounts = [
      {
        id: 'account',
        name: 'fixture',
        username: 'fixture',
        password: 'fixture',
        serverUrl: 'http://portal.test',
        isp: 'campus',
      },
    ];
    initial.currentAccountId = 'account';
  }
  initial.settings = { ...initial.settings, ...settings };
  await storage.set('app_config', initial);
  const config = new ConfigManager(storage);
  await config.load();
  const logger = createLogger();
  const manager = new WifiManager(config, logger);
  const switcher = new WifiSwitcherService({ connect });
  switcher.setConfiguredNetworks(manager.getWifiConfigs());
  const snapshot = () => ({
    connected: !!boundary.ssid,
    ssid: boundary.ssid,
    ipv4: boundary.ssid ? '192.0.2.1' : undefined,
  });
  const send = vi.fn((channel: string, payload: unknown) =>
    boundary.rendererListeners.get(channel)?.(payload)
  );
  listener = new WifiEventListener({
    checkInterval: 1000,
    logger,
    window: { isDestroyed: () => false, webContents: { send } } as never,
    networkDetector: {
      getWifiSnapshot: async () => snapshot(),
      invalidateCache: () => {},
      isWifiEnabled: async () => boundary.enabled,
      getNetworkStatus: async () => ({
        ...snapshot(),
        wifiConnected: !!boundary.ssid,
        authenticated: false,
        connected: options.isOnline ? options.isOnline(boundary.ssid) : !!boundary.ssid,
        ip: '192.0.2.1',
      }),
    } as never,
    wifiManager: manager,
    wifiSwitcherService: switcher,
    configManager: config,
    autoReconnectService: options.auth
      ? new AutoReconnectService(
          options.auth,
          new AccountManager(config),
          logger,
          {},
          {},
          manager,
          config
        )
      : undefined,
  });
  registerWifiIPC(manager, logger, switcher);
  listener.start();
  await vi.advanceTimersByTimeAsync(0);
  return { config, send, switcher };
}

test('R3: 手动切换期间的网络事件不会重新连接旧目标', async () => {
  const connect = vi.fn(async (ssid: string) => {
    if (ssid === 'B') {
      boundary.ssid = null;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    boundary.ssid = ssid;
    return true;
  });
  await setup(connect);
  const manual = boundary.handlers.get(IPC_CHANNELS.WIFI_SWITCH)!(null as never, 'B' as never);
  await vi.advanceTimersByTimeAsync(1600);
  expect(await manual).toBe(true);
  expect(boundary.ssid).toBe('B');
  await vi.advanceTimersByTimeAsync(5000);
  expect(connect.mock.calls.map((c) => c[0])).toEqual(['B']);
  expect(boundary.ssid).toBe('B');
});

test('R6: 关闭系统 WiFi 后恢复进度终止且不再次连接', async () => {
  let finish!: (value: boolean) => void;
  const connect = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      })
  );
  const { send } = await setup(connect);
  window.electronAPI.on = vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
    boundary.rendererListeners.set(channel, callback);
    return () => {
      boundary.rendererListeners.delete(channel);
    };
  });
  const hook = renderHook(() => useWifiReconnect());
  boundary.ssid = null;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3100);
  });
  expect(connect).toHaveBeenCalledTimes(1);
  boundary.enabled = false;
  await act(async () => {
    finish(false);
    await vi.advanceTimersByTimeAsync(6000);
  });
  const progress = send.mock.calls
    .filter((c) => c[0] === 'event:wifi:reconnectProgress')
    .map((c) => c[1]);
  expect(progress.length).toBeGreaterThan(0);
  expect((progress[progress.length - 1] as { status: string }).status).toBe('cancelled');
  expect(hook.result.current.isReconnecting).toBe(false);
  expect(hook.result.current.progress?.status).toBe('cancelled');
  expect(connect).toHaveBeenCalledTimes(1);
});

test('手动目标在正在执行的自动连接之后串行执行，旧目标不再发布成功', async () => {
  let finish!: () => void;
  const connect = vi.fn(async (ssid: string) => {
    if (ssid === 'A')
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    boundary.ssid = ssid;
    return true;
  });
  const { send } = await setup(connect);
  boundary.ssid = null;
  await vi.advanceTimersByTimeAsync(3100);
  expect(connect.mock.calls.map((call) => call[0])).toEqual(['A']);
  const manual = boundary.handlers.get(IPC_CHANNELS.WIFI_SWITCH)!(null as never, 'B' as never);
  finish();
  await vi.advanceTimersByTimeAsync(2000);
  expect(await manual).toBe(true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(connect.mock.calls.map((call) => call[0])).toEqual(['A', 'B']);
  expect(boundary.ssid).toBe('B');
  expect(
    send.mock.calls.some(
      ([channel, value]) =>
        channel === 'event:wifi:reconnectProgress' &&
        (value as { status: string }).status === 'success'
    )
  ).toBe(false);
});

test('启动连接和断线重连的四种组合分别控制首次选择和后续断线', async () => {
  for (const startupAutoConnect of [false, true])
    for (const autoReconnect of [false, true]) {
      const connect = vi.fn(async (ssid: string) => {
        boundary.ssid = ssid;
        return true;
      });
      await setup(connect, { startupAutoConnect, autoReconnect }, null);
      await vi.advanceTimersByTimeAsync(3000);
      expect(connect.mock.calls.map((call) => call[0])).toEqual(startupAutoConnect ? ['A'] : []);
      // 系统完成一次关联后再断开，验证运行时开关，不把冷启动当作断线。
      boundary.ssid = 'A';
      await vi.advanceTimersByTimeAsync(2000);
      connect.mockClear();
      boundary.ssid = null;
      await vi.advanceTimersByTimeAsync(4000);
      expect(connect.mock.calls.map((call) => call[0])).toEqual(autoReconnect ? ['A'] : []);
      listener!.stop();
    }
});

test('R6: 冷却中关闭系统 WiFi 会取消倒计时，停止服务也发布终止状态', async () => {
  const connect = vi.fn(async () => false);
  const { switcher } = await setup(connect, {
    wifiReconnectRetries: 1,
    wifiReconnectCooldownMinutes: 0,
  });
  boundary.ssid = null;
  await vi.advanceTimersByTimeAsync(4500);
  expect(switcher.getRecoveryProgress()?.status).toBe('cooldown');
  boundary.enabled = false;
  await vi.advanceTimersByTimeAsync(6000);
  expect(switcher.getRecoveryProgress()).toMatchObject({
    status: 'cancelled',
    reason: '系统 WiFi 已关闭',
  });
  expect(connect).toHaveBeenCalledTimes(2);
  listener!.stop();
  expect(switcher.getRecoveryProgress()).toMatchObject({
    status: 'cancelled',
    reason: '自动恢复服务已停止',
  });
});

test('窗口重新挂载可恢复冷却截止时间和每个网络的失败原因', async () => {
  const { switcher } = await setup(async () => false, {
    wifiReconnectRetries: 1,
    wifiReconnectCooldownMinutes: 0,
  });
  boundary.ssid = null;
  await vi.advanceTimersByTimeAsync(4500);
  const progress = switcher.getRecoveryProgress();
  expect(progress?.status).toBe('cooldown');
  vi.mocked(window.electronAPI.wifi.getReconnectProgress).mockResolvedValue(progress);
  const hook = renderHook(() => useWifiReconnect());
  await act(async () => {
    await Promise.resolve();
  });
  expect(hook.result.current.progress?.nextRetryAt).toBe(progress?.nextRetryAt);
  expect(hook.result.current.allFailed?.failedList).toHaveLength(2);
  expect(hook.result.current.allFailed?.failedList.map((item) => item.reason)).toEqual([
    '连接超时',
    '连接超时',
  ]);
});

test.each([true, false])(
  'N1: 关联仍在时校园认证=%s 的网络达到联网失败阈值后进入备用网络',
  async (campus) => {
    const auth = new AuthService();
    const login = vi
      .spyOn(auth, 'login')
      .mockResolvedValue({ success: true, message: '门户已认证' });
    const connect = vi.fn(async (ssid: string) => {
      boundary.ssid = ssid;
      return true;
    });
    const { send, switcher } = await setup(
      connect,
      {
        startupAutoConnect: false,
        autoReconnect: true,
        wifiReconnectRetries: 3,
        heartbeatIntervalSeconds: 5,
        heartbeatFailureThreshold: 2,
      },
      'A',
      { isOnline: (ssid) => ssid === 'B', campus, auth }
    );
    await vi.advanceTimersByTimeAsync(2500);
    expect(login).toHaveBeenCalledTimes(campus ? 1 : 0);
    expect(connect).not.toHaveBeenCalled();
    if (campus)
      expect(send.mock.calls).toContainEqual([
        'event:network:statusChanged',
        expect.objectContaining({
          ssid: 'A',
          wifiConnected: true,
          authenticated: true,
          connected: false,
        }),
      ]);
    await vi.advanceTimersByTimeAsync(6000);
    expect(connect.mock.calls.map((call) => call[0])).toEqual(['B']);
    expect(login).toHaveBeenCalledTimes(campus ? 1 : 0);
    expect(switcher.getRecoveryProgress()).toMatchObject({ status: 'success', wifiId: 'B' });
    expect(
      send.mock.calls.some(
        ([channel, value]) =>
          channel === 'event:wifi:reconnectProgress' &&
          (value as { status: string; ssid: string }).status === 'success' &&
          (value as { ssid: string }).ssid === 'A'
      )
    ).toBe(false);
  }
);

test('仅启动自动连接失败后保留可立即重试的失败阶段，并停止自动轮询', async () => {
  window.electronAPI.on = vi.fn((channel, callback) => {
    boundary.rendererListeners.set(channel, callback);
    return () => {
      boundary.rendererListeners.delete(channel);
    };
  });
  const connect = vi.fn(async () => false);
  await setup(
    connect,
    { startupAutoConnect: true, autoReconnect: false, wifiReconnectRetries: 1 },
    null
  );
  const hook = renderHook(() => useWifiReconnect());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20000);
  });
  expect(connect).toHaveBeenCalledTimes(2);
  expect(hook.result.current.progress?.status).toBe('failed');
  expect(hook.result.current.allFailed?.failedList).toHaveLength(2);
  expect(hook.result.current.progress?.nextRetryAt).toBeUndefined();
});
