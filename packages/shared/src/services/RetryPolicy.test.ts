import { afterEach, describe, expect, it, vi } from 'vitest';
import { RetryPolicy } from './RetryPolicy';

describe('RetryPolicy', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('固定退避策略应按固定间隔重试直到成功', async () => {
    vi.useFakeTimers();

    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('首次失败'))
      .mockResolvedValueOnce('ok');
    const onRetry = vi.fn();

    const promise = new RetryPolicy({
      maxRetries: 1,
      delay: 100,
      backoff: 'fixed',
      onRetry,
    }).execute(operation);

    expect(operation).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it('指数退避策略应遵守最大延迟并在超过最大次数后抛错', async () => {
    vi.useFakeTimers();

    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('持续失败'));
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const promise = new RetryPolicy({
      maxRetries: 2,
      delay: 50,
      backoff: 'exponential',
      maxDelay: 80,
    }).execute(operation);
    const rejection = expect(promise).rejects.toThrow('持续失败');

    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(80);

    await rejection;
    expect(operation).toHaveBeenCalledTimes(3);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 50);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 80);
  });
});
