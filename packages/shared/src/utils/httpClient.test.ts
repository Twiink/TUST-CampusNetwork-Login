import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpError, httpGet } from './httpClient';

function createFetchResponse(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'No Content',
    text: async () => body,
    headers: {
      forEach: (callback: (value: string, key: string) => void) =>
        callback('text/plain', 'content-type'),
    },
  };
}

describe('httpClient', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('应返回状态码与原始响应文本', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createFetchResponse('dr1005({"ok":true})')));

    const response = await httpGet('https://netmate.test/login', { timeout: 200 });

    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    expect(response.rawText).toContain('dr1005');
    expect(response.data).toBe(response.rawText);
  });

  it('当服务器响应超过超时时间时应抛出超时错误', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener(
          'abort',
          () => reject(new DOMException('The operation was aborted.', 'AbortError')),
          { once: true }
        );
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const errorPromise = httpGet('https://netmate.test/slow', { timeout: 20 }).catch(
      (error) => error
    );
    await vi.advanceTimersByTimeAsync(20);

    const error = await errorPromise;

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({
      status: 0,
      statusText: 'Timeout',
    });
  });
});
