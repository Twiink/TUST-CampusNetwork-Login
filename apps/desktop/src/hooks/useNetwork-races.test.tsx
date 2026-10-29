// Regressions for overlapping network refreshes and event delivery.
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { NetworkStatus } from '@repo/shared';
import { useNetwork } from './useNetwork';
import { IPC_EVENTS } from '../constants/ipc';

beforeEach(() => vi.clearAllMocks());

it('a newer refresh wins when two refreshes finish in reverse order', async () => {
  let finishOld!: (status: NetworkStatus) => void;
  vi.mocked(window.electronAPI.network.getWifiSSID).mockResolvedValue({
    connected: true,
    ssid: 'Old',
  });
  vi.mocked(window.electronAPI.network.getStatus)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve;
      })
    )
    .mockResolvedValueOnce({
      connected: true,
      authenticated: true,
      wifiConnected: true,
      ssid: 'New',
      ip: '10.2.2.3',
    });
  const { result, unmount } = renderHook(() => useNetwork());
  await waitFor(() => expect(window.electronAPI.network.getStatus).toHaveBeenCalledTimes(1));
  await act(async () => {
    await result.current.fetchStatus();
  });
  await act(async () => {
    finishOld({
      connected: true,
      authenticated: false,
      wifiConnected: true,
      ssid: 'Old',
      ip: '10.1.1.2',
    });
  });
  expect(result.current.wifiSSID).toBe('New');
  expect(result.current.ipAddress).toBe('10.2.2.3');
  expect(result.current.isAuthenticated).toBe(true);
  unmount();
});

it('unmount removes listeners and prevents pending refreshes from committing', async () => {
  let finish!: (status: NetworkStatus) => void;
  const unsubscribe = vi.fn();
  vi.mocked(window.electronAPI.on).mockReturnValue(unsubscribe);
  vi.mocked(window.electronAPI.network.getWifiSSID).mockResolvedValue({
    connected: true,
    ssid: 'Old',
  });
  vi.mocked(window.electronAPI.network.getStatus).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const { result, unmount } = renderHook(() => useNetwork());
  await waitFor(() => expect(window.electronAPI.network.getStatus).toHaveBeenCalledTimes(1));
  const before = result.current;
  unmount();
  await act(async () => {
    finish({
      connected: true,
      authenticated: true,
      wifiConnected: true,
      ssid: 'New',
      ip: '10.2.2.3',
    });
  });
  expect(unsubscribe).toHaveBeenCalledTimes(2);
  expect(result.current).toBe(before);
});

it('a delayed refresh cannot overwrite a more recent network-change event', async () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  vi.mocked(window.electronAPI.on).mockImplementation((channel, listener) => {
    listeners.set(channel, listener);
    return () => listeners.delete(channel);
  });
  let finish!: (status: NetworkStatus) => void;
  vi.mocked(window.electronAPI.network.getStatus).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  vi.mocked(window.electronAPI.network.getInfo).mockResolvedValue({
    ipv4: '10.1.1.2',
    ipv6: null,
    mac: null,
  });
  vi.mocked(window.electronAPI.network.getWifiSSID).mockResolvedValue({
    connected: true,
    ssid: 'Old',
  });
  const { result, unmount } = renderHook(() => useNetwork());
  await waitFor(() => expect(window.electronAPI.network.getStatus).toHaveBeenCalled());
  act(() =>
    listeners.get(IPC_EVENTS.NETWORK_STATUS_CHANGED)?.({
      connected: false,
      authenticated: false,
      wifiConnected: true,
      ssid: 'New',
      ip: '10.2.2.3',
    })
  );
  expect(result.current.wifiSSID).toBe('New');
  await act(async () =>
    finish({
      connected: true,
      authenticated: true,
      wifiConnected: true,
      ssid: 'Old',
      ip: '10.1.1.2',
    })
  );
  expect(result.current.wifiSSID).toBe('New');
  expect(result.current.ipAddress).toBe('10.2.2.3');
  expect(result.current.isAuthenticated).toBe(false);
  unmount();
});
