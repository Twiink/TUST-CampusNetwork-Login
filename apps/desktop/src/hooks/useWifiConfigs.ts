/**
 * WiFi 配置管理 Hook
 */

import { useState, useCallback, useEffect } from 'react';
import type { WifiConfig } from '@repo/shared';

export function useWifiConfigs() {
  const [wifiList, setWifiList] = useState<WifiConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWifiList = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.electronAPI.wifi.list();
      setWifiList(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取 WiFi 列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const addWifi = useCallback(async (wifi: Omit<WifiConfig, 'id'>) => {
    setLoading(true);
    try {
      const newWifi = await window.electronAPI.wifi.add(wifi);
      setWifiList(prev => [...prev, newWifi]);
      setError(null);
      return newWifi;
    } catch (err) {
      const message = err instanceof Error ? err.message : '添加 WiFi 失败';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateWifi = useCallback(async (id: string, updates: Partial<WifiConfig>) => {
    setLoading(true);
    try {
      const updated = await window.electronAPI.wifi.update(id, updates);
      setWifiList(prev => prev.map(w => w.id === id ? updated : w));
      setError(null);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新 WiFi 失败';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const removeWifi = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await window.electronAPI.wifi.remove(id);
      setWifiList(prev => prev.filter(w => w.id !== id));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除 WiFi 失败';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWifiList();
  }, [fetchWifiList]);

  return {
    wifiList,
    loading,
    error,
    fetchWifiList,
    addWifi,
    updateWifi,
    removeWifi,
  };
}
