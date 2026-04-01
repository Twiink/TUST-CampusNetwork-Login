import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkDetector } from './NetworkDetector';

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
});
