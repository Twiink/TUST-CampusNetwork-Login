/**
 * WiFi 事件监听器测试：SSID 轮询、连接/断开/切换事件与窗口广播
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { execWindowsTextMock, networkStatusMock, getCurrentWifiSSIDMock } = vi.hoisted(() => ({
  execWindowsTextMock: vi.fn(),
  networkStatusMock: vi.fn(),
  getCurrentWifiSSIDMock: vi.fn(),
}));

vi.mock('../utils/win-exec', () => ({
  execWindowsText: execWindowsTextMock,
}));

vi.mock('electron', () => ({
  BrowserWindow: class {},
}));

vi.mock('./wifi-event-listener/ssid-probe', async (importOriginal) => {
  const original = await importOriginal<typeof import('./wifi-event-listener/ssid-probe')>();
  return {
    ...original,
    probeCurrentSsid: vi.fn(async () => (await getCurrentWifiSSIDMock()).ssid),
  };
});

import { WifiEventListener } from './wifi-event-listener';
import type { Logger, NetworkDetector, NetworkStatus } from '@repo/shared';

const makeStatus = (overrides: Partial<NetworkStatus> = {}): NetworkStatus => ({
  connected: true,
  authenticated: true,
  wifiConnected: true,
  ssid: 'TUST-WIFI',
  ...overrides,
});

const makeListener = () => {
  const logger: Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  } as unknown as Logger;

  const networkDetector = {
    getNetworkStatus: networkStatusMock,
  } as unknown as NetworkDetector;

  const webContentsSend = vi.fn();
  const window = {
    isDestroyed: vi.fn(() => false),
    webContents: { send: webContentsSend },
  };

  const listener = new WifiEventListener({
    checkInterval: 1000,
    networkDetector,
    logger,
    window: window as never,
  });
  Object.defineProperty(listener, 'platform', { value: 'win32' });

  return { listener, logger, networkDetector, window, webContentsSend };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  networkStatusMock.mockResolvedValue(makeStatus());
  getCurrentWifiSSIDMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

describe('WifiEventListener', () => {
  it('初始检测记录 WiFi 已连接并广播网络状态', async () => {
    getCurrentWifiSSIDMock.mockResolvedValue({ connected: true, ssid: 'TUST-WIFI' });
    const { listener, logger, webContentsSend } = makeListener();

    listener.start();
    await flush();
    await vi.advanceTimersByTimeAsync(1000); // 覆盖 notify 内部 1s 稳定等待

    expect(logger.info).toHaveBeenCalledWith('WiFi 已连接: TUST-WIFI');
    expect(networkStatusMock).toHaveBeenCalled();
    // 先发 loading 再发完整状态
    const events = webContentsSend.mock.calls.map((c) => c[0]);
    expect(events).toContain('event:network:statusLoading');
    expect(events).toContain('event:network:statusChanged');

    listener.stop();
    expect(listener.isActive()).toBe(false);
  });

  it('SSID 变化视为切换并重新广播', async () => {
    getCurrentWifiSSIDMock
      .mockResolvedValueOnce({ connected: true, ssid: 'TUST-WIFI' })
      .mockResolvedValueOnce({ connected: true, ssid: 'TUST-WIFI' })
      .mockResolvedValue({ connected: true, ssid: 'Dorm-5G' });
    const { listener, logger } = makeListener();

    listener.start();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(logger.info).toHaveBeenCalledWith('WiFi 已切换: TUST-WIFI → Dorm-5G');
    listener.stop();
  });

  it('SSID 变为 null 时立即发送断开状态（等待网络检测）', async () => {
    getCurrentWifiSSIDMock
      .mockResolvedValueOnce({ connected: true, ssid: 'TUST-WIFI' })
      .mockResolvedValue({ connected: false, ssid: null });
    const { listener, webContentsSend } = makeListener();

    listener.start();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);

    const statusChanged = webContentsSend.mock.calls
      .filter((c) => c[0] === 'event:network:statusChanged')
      .map((c) => c[1]);
    expect(statusChanged).toContainEqual(
      expect.objectContaining({ connected: false, wifiConnected: false, ssid: undefined })
    );
    listener.stop();
  });

  it('命令持续失败时按断开处理且不抛错', async () => {
    getCurrentWifiSSIDMock
      .mockResolvedValueOnce({ connected: true, ssid: 'TUST-WIFI' })
      .mockResolvedValue({ connected: false, ssid: null });
    const { listener, logger } = makeListener();

    listener.start();
    await flush();
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    // getWindowsSsid 内部吞掉命令错误（返回 null），因此表现为断开而非错误日志
    expect(logger.info).toHaveBeenCalledWith('WiFi 已断开: TUST-WIFI');
    listener.stop();
  });

  it('重复 start 幂等：不重复注册定时器', async () => {
    getCurrentWifiSSIDMock.mockResolvedValue({ connected: true, ssid: 'TUST-WIFI' });
    const { listener, logger } = makeListener();

    listener.start();
    await flush();
    listener.start();
    await flush();

    expect(logger.warn).toHaveBeenCalledWith('WiFi 事件监听器已在运行');
    listener.stop();
    // stop 后再次 stop 也是幂等的
    listener.stop();
    expect(listener.isActive()).toBe(false);
  });

  it('setCheckInterval 无效值被忽略，运行中调整生效', async () => {
    getCurrentWifiSSIDMock.mockResolvedValue({ connected: true, ssid: 'TUST-WIFI' });
    const { listener, logger } = makeListener();

    listener.start();
    await flush();
    (logger.info as unknown as ReturnType<typeof vi.fn>).mockClear();

    listener.setCheckInterval(0);
    listener.setCheckInterval(-5);
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('检测间隔已调整为'));

    listener.setCheckInterval(5000);
    expect(logger.info).toHaveBeenCalledWith('WiFi 检测间隔已调整为: 5000ms');
    listener.stop();
  });

  it('networkDetector 抛错时不崩溃且不发完整状态', async () => {
    getCurrentWifiSSIDMock.mockResolvedValue({ connected: true, ssid: 'TUST-WIFI' });
    networkStatusMock.mockRejectedValue(new Error('detector crashed'));
    const { listener, webContentsSend, logger } = makeListener();

    listener.start();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);

    // loading 已发出，但完整状态因检测器失败不会发出，错误被记录
    const events = webContentsSend.mock.calls.map((c) => c[0]);
    expect(events).toContain('event:network:statusLoading');
    expect(events).not.toContain('event:network:statusChanged');
    expect(logger.error).toHaveBeenCalledWith('获取或发送网络状态失败', expect.any(Error));
    listener.stop();
  });

  it('窗口销毁后不发送任何事件', async () => {
    getCurrentWifiSSIDMock.mockResolvedValue({ connected: true, ssid: 'TUST-WIFI' });
    const { listener, webContentsSend, window } = makeListener();
    window.isDestroyed.mockReturnValue(true);

    listener.start();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);

    expect(webContentsSend).not.toHaveBeenCalled();
    listener.stop();
  });
});
