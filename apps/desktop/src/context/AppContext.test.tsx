import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultAppConfig, type NetworkStatus } from '@repo/shared';
import { AppProvider, useApp } from './AppContext';

const disconnected: NetworkStatus = {
  connected: true,
  authenticated: false,
  wifiConnected: true,
  ssid: 'TUST-WIFI',
};

describe('AppProvider', () => {
  beforeEach(() => {
    vi.mocked(window.electronAPI.config.get).mockResolvedValue(createDefaultAppConfig());
    vi.mocked(window.electronAPI.config.set).mockResolvedValue(true);
    vi.mocked(window.electronAPI.network.getWifiSSID).mockResolvedValue({
      connected: true,
      ssid: 'TUST-WIFI',
    });
    vi.mocked(window.electronAPI.network.getStatus).mockResolvedValue(disconnected);
    vi.mocked(window.electronAPI.network.getInfo).mockResolvedValue({
      ipv4: '10.1.2.3',
      ipv6: null,
      mac: '00:11:22:33:44:55',
    });
    vi.mocked(window.electronAPI.auth.login).mockResolvedValue({
      success: true,
      message: '登录成功',
    });
    vi.mocked(window.electronAPI.auth.logout).mockResolvedValue({
      success: true,
      message: '注销成功',
    });
  });

  it('登录和注销后立即同步网络展示状态', async () => {
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });

    await waitFor(() => expect(result.current.initialCheckDone).toBe(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.networkStatus).toBe('disconnected');
    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      await result.current.login();
    });
    expect(window.electronAPI.auth.login).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.networkStatus).toBe('connected');

    await act(async () => {
      await result.current.logout();
    });
    expect(window.electronAPI.auth.logout).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.networkStatus).toBe('disconnected');
  });

  it('登录失败时不误报已连接', async () => {
    vi.mocked(window.electronAPI.auth.login).mockResolvedValue({
      success: false,
      message: '认证失败',
    });
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    await waitFor(() => expect(result.current.initialCheckDone).toBe(true));

    await act(async () => {
      await result.current.login();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.networkStatus).toBe('disconnected');
  });

  it('配置为空时提供可渲染的默认配置，并能持久化更新', async () => {
    vi.mocked(window.electronAPI.config.get).mockResolvedValue(null);
    const { result } = renderHook(() => useApp(), { wrapper: AppProvider });
    await waitFor(() => expect(result.current.initialCheckDone).toBe(true));

    expect(result.current.config!.accounts).toEqual([]);
    expect(result.current.config!.wifiList).toEqual([]);
    expect(result.current.config!.settings.enableHeartbeat).toBe(true);

    const next = {
      ...result.current.config!,
      settings: { ...result.current.config!.settings, autoReconnect: false },
    };
    await act(async () => {
      await result.current.setConfig(next);
    });

    expect(window.electronAPI.config.set).toHaveBeenCalledWith(next);
    expect(result.current.config!.settings.autoReconnect).toBe(false);
  });

  it('useApp 在 Provider 外使用时明确报错', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useApp())).toThrow('useApp must be used within an AppProvider');
    consoleError.mockRestore();
  });
});
