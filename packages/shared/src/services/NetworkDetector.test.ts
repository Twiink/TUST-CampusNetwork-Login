import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkDetector } from './NetworkDetector';
import type { WifiAdapter } from './WifiAdapter';
import type { LatencyResult, WifiDetails } from '../types/network';

function createFetchResponse(status: number, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 204 ? 'No Content' : 'OK',
    text: async () => body,
    headers: {
      forEach: (_callback: (value: string, key: string) => void) => undefined,
    },
  };
}

function createWifiAdapter(details: WifiDetails | null): WifiAdapter {
  return {
    getCurrentWifi: vi.fn().mockResolvedValue(details),
    getWifiDetails: vi.fn().mockResolvedValue(details),
    getSignalStrength: vi.fn().mockResolvedValue(details?.signalStrength ?? 0),
    getLinkSpeed: vi.fn().mockResolvedValue(details?.linkSpeed ?? 0),
    getFrequency: vi.fn().mockResolvedValue(details?.frequency ?? 0),
    getChannel: vi.fn().mockResolvedValue(details?.channel ?? null),
    getBSSID: vi.fn().mockResolvedValue(details?.bssid ?? null),
    getSecurity: vi.fn().mockResolvedValue(details?.security ?? null),
    getNetworkInfo: vi.fn().mockResolvedValue({
      ipv4: details?.ipv4,
      ipv6: details?.ipv6,
      mac: details?.mac,
    }),
    connect: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(undefined),
    scan: vi.fn().mockResolvedValue([]),
  };
}

const wifiDetails: WifiDetails = {
  ssid: 'TUST-WIFI',
  connected: true,
  signalStrength: 88,
  linkSpeed: 866,
  frequency: 5000,
  channel: 149,
  security: 'WPA2',
  bssid: '00:11:22:33:44:55',
  ipv4: '10.1.2.3',
  ipv6: '2001:db8::1',
  mac: '00:aa:bb:cc:dd:ee',
  gateway: '10.1.0.1',
  dns: ['10.1.0.2', '10.1.0.3'],
  subnetMask: '255.255.0.0',
};

const latency: LatencyResult = {
  value: 20,
  status: 'excellent',
  target: 'https://latency.test',
  source: '测试目标',
  timestamp: 1,
};

describe('NetworkDetector', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('应使用自定义连通性检测地址判断网络可用', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    const detector = new NetworkDetector(undefined, undefined, {
      connectivityCheckUrls: ['https://netmate.test/generate_204'],
      connectivityTimeoutMs: 200,
    });

    await expect(detector.checkConnectivity()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://netmate.test/generate_204',
      expect.objectContaining({
        method: 'GET',
      })
    );
  });

  it('captive portal 返回 200 时应判为未连通（严格 204）', async () => {
    // 未认证时校园网门户拦截返回 200 门户页，不能误判为已联网
    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse(200, '<html>portal</html>'));
    vi.stubGlobal('fetch', fetchMock);

    const detector = new NetworkDetector(undefined, undefined, {
      connectivityCheckUrls: ['https://netmate.test/generate_204'],
      connectivityTimeoutMs: 200,
    });

    await expect(detector.checkConnectivity()).resolves.toBe(false);
  });

  it('所有探测点均非 204 时应判为未连通', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse(302));
    vi.stubGlobal('fetch', fetchMock);

    const detector = new NetworkDetector(undefined, undefined, {
      connectivityCheckUrls: ['https://a.test/generate_204', 'https://b.test/generate_204'],
      connectivityTimeoutMs: 200,
    });

    await expect(detector.checkConnectivity()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('首个延迟目标超时后应回退到备用目标', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/slow')) {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted.', 'AbortError')),
            { once: true }
          );
        });
      }

      return Promise.resolve(createFetchResponse(204));
    });

    vi.stubGlobal('fetch', fetchMock);

    const detector = new NetworkDetector(undefined, undefined, {
      pingTargets: [
        { url: 'https://netmate.test/slow', source: '慢目标' },
        { url: 'https://netmate.test/fast', source: '快目标' },
      ],
      latencyTimeoutMs: 20,
    });

    const resultPromise = detector.measureLatency();
    await vi.advanceTimersByTimeAsync(20);
    const result = await resultPromise;

    expect(result.source).toBe('快目标');
    expect(result.target).toBe('https://netmate.test/fast');
    expect(result.status).not.toBe('timeout');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('任一探测点返回 204 时应立即判为在线', async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('fast')) {
        return Promise.resolve(createFetchResponse(204));
      }
      return new Promise((resolve) => setTimeout(() => resolve(createFetchResponse(204)), 2000));
    });
    vi.stubGlobal('fetch', fetchMock);

    const detector = new NetworkDetector(undefined, undefined, {
      connectivityCheckUrls: ['https://slow.test/generate_204', 'https://fast.test/generate_204'],
      connectivityTimeoutMs: 3000,
    });

    await expect(detector.checkConnectivity()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('延迟结果在缓存期内不应重复发起 HEAD 请求', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    const detector = new NetworkDetector(undefined, undefined, {
      pingTargets: [{ url: 'https://latency.test/head', source: '延迟目标' }],
      latencyTimeoutMs: 100,
      latencyCacheMs: 60_000,
    });

    const first = await detector.measureLatency();
    const second = await detector.measureLatency();

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('传入最近状态时按 authenticated 字段判断，而不是仅看 connected', async () => {
    const detector = new NetworkDetector();

    await expect(
      detector.isAuthenticated({
        connected: true,
        authenticated: false,
        wifiConnected: true,
      })
    ).resolves.toBe(false);
    await expect(
      detector.isAuthenticated({
        connected: false,
        authenticated: true,
        wifiConnected: true,
      })
    ).resolves.toBe(true);
  });

  it('在线时返回完整 WiFi 详情并复用适配器提供的延迟', async () => {
    const adapter = createWifiAdapter({ ...wifiDetails, latency });
    const detector = new NetworkDetector(adapter, undefined, {
      connectivityCheckUrls: ['https://netmate.test/generate_204'],
    });
    const fetchMock = vi.fn().mockResolvedValue(createFetchResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    await expect(detector.getCurrentWifiStatus()).resolves.toMatchObject({
      connected: true,
      authenticated: true,
      wifiConnected: true,
      ssid: 'TUST-WIFI',
      signalStrength: 88,
      linkSpeed: 866,
      frequency: 5000,
      ip: '10.1.2.3',
      ipv6: '2001:db8::1',
      mac: '00:aa:bb:cc:dd:ee',
      gateway: '10.1.0.1',
      dns: '10.1.0.2',
      subnetMask: '255.255.0.0',
      bssid: '00:11:22:33:44:55',
      channel: 149,
      security: 'WPA2',
      latency,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('WiFi 已连接但无互联网时仍保留 WiFi 连接状态', async () => {
    const adapter = createWifiAdapter(wifiDetails);
    const detector = new NetworkDetector(adapter, undefined, {
      connectivityCheckUrls: ['https://netmate.test/generate_204'],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createFetchResponse(200, '<html>portal</html>'))
    );

    await expect(detector.getCurrentWifiStatus()).resolves.toEqual({
      connected: false,
      authenticated: false,
      wifiConnected: true,
      ssid: 'TUST-WIFI',
    });
  });

  it('未配置适配器时安全返回离线状态', async () => {
    const detector = new NetworkDetector(undefined, undefined, {
      connectivityCheckUrls: ['https://netmate.test/generate_204'],
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(detector.getCurrentWifiStatus()).resolves.toEqual({
      connected: false,
      authenticated: false,
      wifiConnected: false,
      ssid: undefined,
    });
  });

  it('缺少适配器时信号与详情接口明确报错', async () => {
    const detector = new NetworkDetector();
    await expect(detector.getSignalStrength()).rejects.toThrow('WifiAdapter not configured');
    await expect(detector.getWifiDetails()).rejects.toThrow('WifiAdapter not configured');
  });

  it('获取详情时若适配器未提供延迟则补测', async () => {
    const adapter = createWifiAdapter(wifiDetails);
    const detector = new NetworkDetector(adapter, undefined, {
      pingTargets: [{ url: 'https://latency.test', source: '测试目标' }],
      latencyTimeoutMs: 100,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createFetchResponse(204)));

    const details = await detector.getWifiDetails();

    expect(details?.latency?.target).toBe('https://latency.test');
    expect(details?.ssid).toBe('TUST-WIFI');
  });

  it('适配器无当前 WiFi 时 getWifiDetails 返回 null', async () => {
    const adapter = createWifiAdapter(null);
    const detector = new NetworkDetector(adapter);

    await expect(detector.getWifiDetails()).resolves.toBeNull();
  });

  it('checkUrl 成功与异常分别返回布尔值', async () => {
    const detector = new NetworkDetector();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse(204))
      .mockRejectedValueOnce(new Error('dns failed'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(detector.checkUrl('https://ok.test')).resolves.toBe(true);
    await expect(detector.checkUrl('https://bad.test')).resolves.toBe(false);
  });

  it('轮询立即回调，并跳过上一轮尚未结束的检测', async () => {
    vi.useFakeTimers();
    const detector = new NetworkDetector();
    let resolveFirst!: (status: {
      connected: boolean;
      authenticated: boolean;
      wifiConnected: boolean;
    }) => void;
    const first = new Promise<{
      connected: boolean;
      authenticated: boolean;
      wifiConnected: boolean;
    }>((resolve) => {
      resolveFirst = resolve;
    });
    const getStatus = vi
      .spyOn(detector, 'getNetworkStatus')
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({
        connected: true,
        authenticated: true,
        wifiConnected: true,
      });
    const callback = vi.fn();

    detector.startPolling(callback, { interval: 1000, immediate: true });
    await vi.advanceTimersByTimeAsync(1000);
    expect(getStatus).toHaveBeenCalledTimes(1);

    resolveFirst({
      connected: false,
      authenticated: false,
      wifiConnected: false,
    });
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(1000);

    expect(getStatus).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith({
      connected: true,
      authenticated: true,
      wifiConnected: true,
    });
    detector.stopPolling();
    expect(detector.isPollingActive()).toBe(false);
  });
});
