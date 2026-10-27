import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WifiConfig } from '@repo/shared';
import { useWifiConfigs } from './useWifiConfigs';

const wifi: WifiConfig = {
  id: 'w1',
  ssid: 'TUST-WIFI',
  password: 'wifi-pass',
  autoConnect: true,
  requiresAuth: true,
  linkedAccountIds: ['a1'],
  linkedAccountId: 'a1',
  priority: 1,
  lastConnectedAt: null,
};

describe('useWifiConfigs', () => {
  beforeEach(() => {
    vi.mocked(window.electronAPI.wifi.list).mockResolvedValue([wifi]);
    vi.mocked(window.electronAPI.wifi.add).mockResolvedValue({ ...wifi, id: 'w2', ssid: 'Lab' });
    vi.mocked(window.electronAPI.wifi.update).mockResolvedValue({ ...wifi, autoConnect: false });
    vi.mocked(window.electronAPI.wifi.remove).mockResolvedValue(undefined);
  });

  it('加载、添加、更新并删除 WiFi 配置', async () => {
    const { result } = renderHook(() => useWifiConfigs());
    await waitFor(() => expect(result.current.wifiList).toEqual([wifi]));

    await act(async () => {
      await result.current.addWifi({ ...wifi, ssid: 'Lab' });
    });
    expect(result.current.wifiList.map((item) => item.ssid)).toEqual(['TUST-WIFI', 'Lab']);

    await act(async () => {
      await result.current.updateWifi(wifi.id, { autoConnect: false });
    });
    expect(result.current.wifiList[0].autoConnect).toBe(false);

    await act(async () => {
      await result.current.removeWifi(wifi.id);
    });
    expect(result.current.wifiList.map((item) => item.id)).toEqual(['w2']);
  });

  it('加载失败时保留空列表并提供错误信息', async () => {
    vi.mocked(window.electronAPI.wifi.list).mockRejectedValue(new Error('读取失败'));
    const { result } = renderHook(() => useWifiConfigs());

    await waitFor(() => expect(result.current.error).toBe('读取失败'));
    expect(result.current.wifiList).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('更新失败会抛出并记录错误', async () => {
    const { result } = renderHook(() => useWifiConfigs());
    await waitFor(() => expect(result.current.wifiList).toEqual([wifi]));
    vi.mocked(window.electronAPI.wifi.update).mockRejectedValue(new Error('配置冲突'));

    await act(async () => {
      await expect(result.current.updateWifi(wifi.id, { priority: 2 })).rejects.toThrow('配置冲突');
    });
    expect(result.current.error).toBe('配置冲突');
    expect(result.current.wifiList).toEqual([wifi]);
  });
});
