import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHeartbeat, type HeartbeatState, type ReconnectProgress } from './useHeartbeat';

describe('useHeartbeat', () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const unsubscribers: Array<ReturnType<typeof vi.fn>> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T12:00:00.000Z'));
    listeners.clear();
    unsubscribers.length = 0;
    vi.mocked(window.electronAPI.on).mockImplementation((channel, callback) => {
      listeners.set(channel, callback);
      const unsubscribe = vi.fn();
      unsubscribers.push(unsubscribe);
      return unsubscribe;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('从下一次检测时间戳计算倒计时', () => {
    const { result } = renderHook(() => useHeartbeat());
    const now = Date.now();
    const heartbeat: HeartbeatState = {
      remainingSeconds: 30,
      totalSeconds: 30,
      connected: true,
      authenticated: true,
      latency: null,
      lastCheckTime: now,
      nextHeartbeatAt: now + 5000,
    };

    act(() => {
      listeners.get('event:heartbeat:countdown')?.(heartbeat);
    });
    expect(result.current.heartbeat.remainingSeconds).toBe(5);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.heartbeat.remainingSeconds).toBe(3);
  });

  it('没有下一心跳时间时使用主进程给出的剩余秒数', () => {
    const { result } = renderHook(() => useHeartbeat());

    act(() => {
      listeners.get('event:heartbeat:countdown')?.({
        remainingSeconds: 12,
        totalSeconds: 30,
        connected: false,
        authenticated: false,
        latency: null,
        lastCheckTime: Date.now(),
      });
    });

    expect(result.current.heartbeat.remainingSeconds).toBe(12);
  });

  it('重连终态展示 3 秒后自动恢复 idle', () => {
    const { result } = renderHook(() => useHeartbeat());
    const progress: ReconnectProgress = {
      status: 'success',
      currentAttempt: 2,
      maxAttempts: 3,
      message: '认证已恢复',
    };

    act(() => {
      listeners.get('event:reconnect:progress')?.(progress);
    });
    expect(result.current.reconnectProgress).toEqual(progress);

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(result.current.reconnectProgress.status).toBe('success');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.reconnectProgress).toEqual({
      status: 'idle',
      currentAttempt: 0,
      maxAttempts: 3,
      message: '',
    });
  });

  it('重复终态事件只保留最后一个复位定时器', () => {
    renderHook(() => useHeartbeat());
    const success: ReconnectProgress = {
      status: 'success',
      currentAttempt: 1,
      maxAttempts: 3,
      message: '成功',
    };
    const failed: ReconnectProgress = {
      status: 'failed',
      currentAttempt: 3,
      maxAttempts: 3,
      message: '失败',
    };

    act(() => {
      listeners.get('event:reconnect:progress')?.(success);
      vi.advanceTimersByTime(2000);
      listeners.get('event:reconnect:progress')?.(failed);
      vi.advanceTimersByTime(2000);
    });

    expect(listeners.size).toBe(2);
  });

  it('卸载时清理倒计时、复位定时器并取消订阅', () => {
    const { unmount } = renderHook(() => useHeartbeat());

    act(() => {
      listeners.get('event:reconnect:progress')?.({
        status: 'failed',
        currentAttempt: 3,
        maxAttempts: 3,
        message: '失败',
      });
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(unsubscribers).toHaveLength(2);
    expect(unsubscribers.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
