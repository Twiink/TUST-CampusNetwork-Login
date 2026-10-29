import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NetworkStatus } from '@repo/shared';
import { IPC_EVENTS } from '../constants/ipc';
import { useNetwork } from './useNetwork';

const onlineStatus: NetworkStatus = {
  connected: true,
  authenticated: true,
  wifiConnected: true,
  ssid: 'TUST-WIFI',
  ip: '10.1.2.3',
};

const onlineInfo = {
  ipv4: '10.1.2.3',
  ipv6: null,
  mac: '00:11:22:33:44:55',
};

describe('useNetwork', () => {
  beforeEach(() => {
    vi.mocked(window.electronAPI.network.getWifiSSID).mockResolvedValue({
      connected: true,
      ssid: 'TUST-WIFI',
    });
    vi.mocked(window.electronAPI.network.getStatus).mockResolvedValue(onlineStatus);
    vi.mocked(window.electronAPI.network.getInfo).mockResolvedValue(onlineInfo);
    vi.mocked(window.electronAPI.network.check).mockResolvedValue(true);
  });

  it('WiFi 已连接时加载完整状态', async () => {
    const { result } = renderHook(() => useNetwork());

    await waitFor(() => expect(result.current.initialCheckDone).toBe(true));
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(result.current.wifiSSID).toBe('TUST-WIFI');
    expect(result.current.ipAddress).toBe('10.1.2.3');
    expect(result.current.loading).toBe(false);
  });

  it('WiFi 未连接时跳过完整网络查询', async () => {
    vi.mocked(window.electronAPI.network.getWifiSSID).mockResolvedValue({
      connected: false,
      ssid: null,
    });
    const { result } = renderHook(() => useNetwork());

    await waitFor(() => expect(result.current.initialCheckDone).toBe(true));
    expect(result.current.wifiConnected).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(window.electronAPI.network.getStatus).not.toHaveBeenCalled();
  });

  it('响应主进程的加载与状态事件', async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    vi.mocked(window.electronAPI.on).mockImplementation((channel, callback) => {
      listeners.set(channel, callback);
      return () => undefined;
    });
    const { result } = renderHook(() => useNetwork());
    await waitFor(() => expect(result.current.initialCheckDone).toBe(true));

    act(() => {
      listeners.get(IPC_EVENTS.NETWORK_STATUS_LOADING)?.({
        loading: true,
        wifiConnected: true,
        ssid: 'TUST-WIFI',
      });
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.initialCheckDone).toBe(false);

    act(() => {
      listeners.get(IPC_EVENTS.NETWORK_STATUS_CHANGED)?.({
        ...onlineStatus,
        authenticated: false,
      });
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('可立即同步认证状态且连通性异常按离线处理', async () => {
    const { result } = renderHook(() => useNetwork());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => result.current.setAuthenticated(false));
    expect(result.current.isAuthenticated).toBe(false);
    act(() => result.current.setAuthenticated(true));
    expect(result.current.isAuthenticated).toBe(true);

    vi.mocked(window.electronAPI.network.check).mockRejectedValue(new Error('probe failed'));
    await expect(result.current.checkConnectivity()).resolves.toBe(false);
  });

  it('刷新失败不会丢弃已有状态', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useNetwork());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    vi.mocked(window.electronAPI.network.getStatus).mockRejectedValue(new Error('offline'));

    await act(async () => {
      await result.current.fetchStatus();
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
