/**
 * 网络信息 Hook
 *
 * 提供网络状态管理和 WiFi 信息获取
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getNetworkInfo,
  getWifiStatus,
  requestLocationPermission,
  hasLocationPermission,
  isNativeModuleAvailable,
  type NetworkInfo,
  type WifiStatus,
} from '../native/WifiModule';

export interface UseNetworkResult {
  /** 网络信息 */
  networkInfo: NetworkInfo;
  /** WiFi 状态 */
  wifiStatus: WifiStatus;
  /** 是否正在加载 */
  loading: boolean;
  /** 是否有位置权限 */
  hasPermission: boolean;
  /** 原生模块是否可用 */
  isModuleAvailable: boolean;
  /** 刷新网络信息 */
  refresh: () => Promise<void>;
  /** 请求位置权限 */
  requestPermission: () => Promise<boolean>;
}

const defaultNetworkInfo: NetworkInfo = {
  wifiEnabled: false,
  connected: false,
  ssid: null,
  ipv4: null,
  ipv6: null,
  mac: null,
};

const defaultWifiStatus: WifiStatus = {
  connected: false,
  ssid: null,
};

/**
 * 网络信息 Hook
 *
 * @param autoRefresh 是否自动刷新，默认 true
 * @param refreshInterval 刷新间隔（毫秒），默认 10000
 */
export function useNetwork(
  autoRefresh: boolean = true,
  refreshInterval: number = 10000
): UseNetworkResult {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>(defaultNetworkInfo);
  const [wifiStatus, setWifiStatus] = useState<WifiStatus>(defaultWifiStatus);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const isModuleAvailable = isNativeModuleAvailable();

  const refresh = useCallback(async () => {
    if (!isModuleAvailable) {
      setLoading(false);
      return;
    }

    try {
      const [info, status, permission] = await Promise.all([
        getNetworkInfo(),
        getWifiStatus(),
        hasLocationPermission(),
      ]);

      setNetworkInfo(info);
      setWifiStatus(status);
      setHasPermission(permission);
    } catch (error) {
      console.warn('Failed to refresh network info:', error);
    } finally {
      setLoading(false);
    }
  }, [isModuleAvailable]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const granted = await requestLocationPermission();
    setHasPermission(granted);
    if (granted) {
      // 权限授予后刷新网络信息
      await refresh();
    }
    return granted;
  }, [refresh]);

  // 初始化时获取网络信息
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh || !isModuleAvailable) {
      return;
    }

    const intervalId = setInterval(refresh, refreshInterval);
    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, refresh, isModuleAvailable]);

  return {
    networkInfo,
    wifiStatus,
    loading,
    hasPermission,
    isModuleAvailable,
    refresh,
    requestPermission,
  };
}

export default useNetwork;
