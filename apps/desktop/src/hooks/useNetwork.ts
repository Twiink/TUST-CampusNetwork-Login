/**
 * 网络状态 Hook
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { NetworkStatus } from '@repo/shared';
import { IPC_EVENTS } from '../constants/ipc';
import type { NetworkInfo, WifiStatus } from '../types/electron.d';

export function useNetwork() {
  const generation = useRef(0);
  const mounted = useRef(true);
  const [status, setStatus] = useState<NetworkStatus>({
    connected: false,
    authenticated: false,
    wifiConnected: false,
  });
  const [info, setInfo] = useState<NetworkInfo>({
    ipv4: null,
    ipv6: null,
    mac: null,
  });
  const [wifiStatus, setWifiStatus] = useState<WifiStatus>({
    connected: false,
    ssid: null,
  });
  const [loading, setLoading] = useState(true); // 初始为true，表示正在加载
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  const commitStatus = useCallback((networkStatus: NetworkStatus) => {
    setStatus(networkStatus);
    setInfo({
      ipv4: networkStatus.ip ?? null,
      ipv6: networkStatus.ipv6 ?? null,
      mac: networkStatus.mac ?? null,
    });
    setWifiStatus({ connected: networkStatus.wifiConnected, ssid: networkStatus.ssid ?? null });
  }, []);
  const fetchStatus = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const networkStatus = await window.electronAPI.network.getStatus();
      if (!mounted.current || request !== generation.current) return;
      commitStatus(networkStatus);
      setInitialCheckDone(true);
    } catch (err) {
      if (mounted.current && request === generation.current)
        console.error('Failed to fetch network status:', err);
    } finally {
      if (mounted.current && request === generation.current) setLoading(false);
    }
  }, [commitStatus]);

  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    try {
      return await window.electronAPI.network.check();
    } catch {
      return false;
    }
  }, []);

  const setAuthenticated = useCallback((authenticated: boolean) => {
    setStatus((previous) => ({ ...previous, authenticated }));
  }, []);

  // 快速检测WiFi连接状态
  const quickCheckWifi = useCallback(async () => {
    const request = generation.current;
    try {
      const wifi = await window.electronAPI.network.getWifiSSID();
      if (!mounted.current || request !== generation.current) return null;
      setWifiStatus(wifi);
      setInitialCheckDone(true);
      return wifi.connected;
    } catch (err) {
      if (!mounted.current || request !== generation.current) return null;
      console.error('Failed to quick check WiFi:', err);
      setInitialCheckDone(true);
      return false;
    }
  }, []);

  // 监听网络状态变化
  useEffect(() => {
    // 监听 loading 状态
    mounted.current = true;
    generation.current += 1;
    const unsubscribeLoading = window.electronAPI.on(
      IPC_EVENTS.NETWORK_STATUS_LOADING,
      (loadingData: unknown) => {
        const data = loadingData as {
          loading: boolean;
          wifiConnected: boolean;
          ssid: string | null;
        };
        generation.current += 1;
        setLoading(data.loading);
        commitStatus({
          connected: false,
          authenticated: false,
          wifiConnected: data.wifiConnected,
          ssid: data.ssid ?? undefined,
        });
        setWifiStatus({
          connected: data.wifiConnected,
          ssid: data.ssid,
        });
        setInitialCheckDone(false);
      }
    );

    // 监听完整网络状态更新
    const unsubscribeStatus = window.electronAPI.on(
      IPC_EVENTS.NETWORK_STATUS_CHANGED,
      (newStatus: unknown) => {
        const networkStatus = newStatus as NetworkStatus;
        generation.current += 1;
        commitStatus(networkStatus);
        setLoading(false);
        setInitialCheckDone(true);
      }
    );

    return () => {
      mounted.current = false;
      generation.current += 1;
      unsubscribeLoading();
      unsubscribeStatus();
    };
  }, [commitStatus]);

  // 初始化：先快速检测WiFi，然后获取完整信息
  useEffect(() => {
    const initNetwork = async () => {
      const wifiConnected = await quickCheckWifi();
      if (wifiConnected === null || !mounted.current) return;
      if (wifiConnected) {
        // WiFi已连接，获取完整信息
        await fetchStatus();
      } else {
        // WiFi未连接，停止加载
        setLoading(false);
      }
    };

    initNetwork();
  }, [quickCheckWifi, fetchStatus]);

  return {
    status,
    info,
    wifiStatus,
    loading,
    initialCheckDone,
    fetchStatus,
    checkConnectivity,
    setAuthenticated,
    isConnected: status.connected,
    isAuthenticated: status.authenticated,
    ipAddress: info.ipv4 || '0.0.0.0',
    wifiConnected: wifiStatus.connected,
    wifiSSID: wifiStatus.ssid,
  };
}
