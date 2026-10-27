import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLogger,
  type ConfigManager,
  type NetworkDetector,
  type WifiManager,
} from '@repo/shared';
import type { WifiSwitcherService } from './wifi-switcher';
const mocks = vi.hoisted(() => ({ probe: vi.fn(), reconnect: vi.fn(), startup: vi.fn() }));
vi.mock('electron', () => ({ BrowserWindow: class {} }));
vi.mock('@repo/native', () => ({ watchNetwork: () => false }));
vi.mock('./network', () => ({ enrichStatusAuthFields: vi.fn() }));
vi.mock('./wifi-switcher', () => ({ scanAvailableNetworks: vi.fn() }));
vi.mock('./wifi-event-listener/ssid-probe', () => ({ probeCurrentSsid: mocks.probe }));
vi.mock('./wifi-event-listener/reconnect-flow', () => ({
  executeAutoReconnect: mocks.reconnect,
  executeStartupAutoConnect: mocks.startup,
  inCooldown: (last: number, duration: number, now: number) =>
    duration > 0 && now - last < duration,
}));
import { WifiEventListener } from './wifi-event-listener';

describe('冷却后调度回归', () => {
  let listener: WifiEventListener;
  let enabled: boolean;
  let radio: boolean;
  const create = () => {
    const settings = () => ({ autoReconnect: enabled, wifiReconnectCooldownMinutes: 0 });
    return new WifiEventListener({
      checkInterval: 1000,
      window: null,
      logger: createLogger(),
      configManager: {
        getSettings: settings,
        getConfig: () => ({ settings: settings() }),
      } as unknown as ConfigManager,
      networkDetector: { isWifiEnabled: async () => radio } as unknown as NetworkDetector,
      wifiManager: {
        getWifiConfigs: () => [{ ssid: 'TUST', autoConnect: true }],
      } as unknown as WifiManager,
      wifiSwitcherService: {} as WifiSwitcherService,
    });
  };
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T00:00:00Z'));
    vi.clearAllMocks();
    enabled = radio = true;
    mocks.probe.mockResolvedValue('TUST');
    mocks.reconnect.mockResolvedValue(false);
    mocks.startup.mockResolvedValue(null);
    listener = create();
    listener.start();
    await vi.advanceTimersByTimeAsync(0);
  });
  afterEach(() => {
    listener.stop();
    vi.useRealTimers();
  });
  async function disconnect() {
    mocks.probe.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.reconnect).toHaveBeenCalledTimes(1);
  }
  it('全失败后只保留一个任务，零冷却至少退避5秒', async () => {
    await disconnect();
    await vi.advanceTimersByTimeAsync(4999);
    expect(mocks.reconnect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.reconnect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.reconnect).toHaveBeenCalledTimes(3);
  });
  it.each(['setting', 'radio', 'stop'])('取消后不再尝试：%s', async (reason) => {
    await disconnect();
    if (reason === 'setting') {
      enabled = false;
      listener.resetCooldown();
    }
    if (reason === 'radio') radio = false;
    if (reason === 'stop') listener.stop();
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.reconnect).toHaveBeenCalledTimes(1);
  });
  it('启动全失败也会调度下一轮', async () => {
    listener.stop();
    mocks.probe.mockResolvedValue(null);
    mocks.startup.mockResolvedValue(false);
    listener = create();
    listener.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.reconnect).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.reconnect).toHaveBeenCalledTimes(1);
  });
});
