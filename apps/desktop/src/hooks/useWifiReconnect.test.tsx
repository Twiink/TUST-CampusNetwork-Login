import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_EVENTS } from '../constants/ipc';
import type { WifiAllReconnectsFailed, WifiReconnectProgress } from '../types/electron';
import { useWifiReconnect } from './useWifiReconnect';

describe('useWifiReconnect', () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const unsubscribers: Array<ReturnType<typeof vi.fn>> = [];

  beforeEach(() => {
    vi.useFakeTimers();
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

  it('connecting 时进入重连状态，failed 时结束重连但保留进度', () => {
    const { result } = renderHook(() => useWifiReconnect());
    const connecting: WifiReconnectProgress = {
      ssid: 'TUST-WIFI',
      attempt: 1,
      maxAttempts: 3,
      status: 'connecting',
    };
    const failed: WifiReconnectProgress = {
      ...connecting,
      attempt: 3,
      status: 'failed',
    };

    act(() => listeners.get(IPC_EVENTS.WIFI_RECONNECT_PROGRESS)?.(connecting));
    expect(result.current.isReconnecting).toBe(true);
    expect(result.current.progress).toEqual(connecting);

    act(() => listeners.get(IPC_EVENTS.WIFI_RECONNECT_PROGRESS)?.(failed));
    expect(result.current.isReconnecting).toBe(false);
    expect(result.current.progress).toEqual(failed);
  });

  it('全部失败事件清空进度并可手动关闭', () => {
    const { result } = renderHook(() => useWifiReconnect());
    const failed: WifiAllReconnectsFailed = {
      failedList: [
        {
          ssid: 'TUST-WIFI',
          priority: 1,
          reason: '密码错误',
        },
      ],
    };

    act(() => listeners.get(IPC_EVENTS.WIFI_ALL_RECONNECTS_FAILED)?.(failed));
    expect(result.current.isReconnecting).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(result.current.allFailed).toEqual(failed);

    act(() => result.current.clearAllFailed());
    expect(result.current.allFailed).toBeNull();
  });

  it('成功时清除失败状态并在 3 秒后清除进度', () => {
    const { result } = renderHook(() => useWifiReconnect());
    const failed: WifiAllReconnectsFailed = {
      failedList: [{ ssid: 'OLD', priority: 2, reason: '超时' }],
    };
    const success: WifiReconnectProgress = {
      ssid: 'TUST-WIFI',
      attempt: 2,
      maxAttempts: 3,
      status: 'success',
    };

    act(() => listeners.get(IPC_EVENTS.WIFI_ALL_RECONNECTS_FAILED)?.(failed));
    act(() => listeners.get(IPC_EVENTS.WIFI_RECONNECT_PROGRESS)?.(success));
    expect(result.current.isReconnecting).toBe(false);
    expect(result.current.allFailed).toBeNull();
    expect(result.current.progress).toEqual(success);

    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.progress).toBeNull();
  });

  it('卸载时清理延迟复位并取消两个监听器', () => {
    const { unmount } = renderHook(() => useWifiReconnect());

    act(() =>
      listeners.get(IPC_EVENTS.WIFI_RECONNECT_PROGRESS)?.({
        ssid: 'TUST-WIFI',
        attempt: 1,
        maxAttempts: 3,
        status: 'success',
      })
    );
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(unsubscribers).toHaveLength(2);
    expect(unsubscribers.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true);
  });
});
