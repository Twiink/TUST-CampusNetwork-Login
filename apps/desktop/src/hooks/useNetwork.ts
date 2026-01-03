/**
 * 网络状态 Hook
 */

import { useState, useCallback, useEffect } from 'react';
import type { NetworkStatus } from '@repo/shared';
import { IPC_EVENTS, type NetworkInfo, type WifiStatus } from '../types/electron.d';

export function useNetwork() {
  const [status, setStatus] = useState<NetworkStatus>({
    connected: false,
    authenticated: false,
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

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [networkStatus, networkInfo, wifi] = await Promise.all([
        window.electronAPI.network.getStatus(),
        window.electronAPI.network.getInfo(),
        window.electronAPI.network.getWifiSSID(),
      ]);
      setStatus(networkStatus);
      setInfo(networkInfo);
      setWifiStatus(wifi);
    } catch (err) {
      console.error('Failed to fetch network status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    try {
      return await window.electronAPI.network.check();
    } catch {
      return false;
    }
  }, []);

  // 快速检测WiFi连接状态
  const quickCheckWifi = useCallback(async () => {
    try {
      const wifi = await window.electronAPI.network.getWifiSSID();
      setWifiStatus(wifi);
      setInitialCheckDone(true);
      return wifi.connected;
    } catch (err) {
      console.error('Failed to quick check WiFi:', err);
      setInitialCheckDone(true);
      return false;
    }
  }, []);

  // 监听网络状态变化
  useEffect(() => {
    const unsubscribe = window.electronAPI.on(
      IPC_EVENTS.NETWORK_STATUS_CHANGED,
      (newStatus: unknown) => {
        setStatus(newStatus as NetworkStatus);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // 初始化：先快速检测WiFi，然后获取完整信息
  useEffect(() => {
    const initNetwork = async () => {
      const wifiConnected = await quickCheckWifi();
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
    isConnected: status.connected,
    isAuthenticated: status.authenticated,
    ipAddress: info.ipv4 || '0.0.0.0',
    wifiConnected: wifiStatus.connected,
    wifiSSID: wifiStatus.ssid,
  };
}
