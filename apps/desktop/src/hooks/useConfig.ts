/**
 * 配置管理 Hook
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { createDefaultAppConfig, type AppConfig, type AppSettings } from '@repo/shared';

export type ConfigUpdate = AppConfig | ((current: AppConfig) => AppConfig);

export function useConfig() {
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configRef = useRef<AppConfig | null>(null);
  const updateQueueRef = useRef<Promise<void>>(Promise.resolve());

  const applyConfig = useCallback((nextConfig: AppConfig | null) => {
    if (
      nextConfig &&
      configRef.current &&
      (nextConfig.revision ?? 0) < (configRef.current.revision ?? 0)
    )
      return;
    configRef.current = nextConfig;
    setConfig(nextConfig);
  }, []);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.config.get();
      applyConfig(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取配置失败');
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  const updateConfig = useCallback(
    (update: ConfigUpdate) => {
      const task = updateQueueRef.current.then(async () => {
        setLoading(true);
        setSaveState('saving');
        try {
          const current =
            (await window.electronAPI.config.get()) ??
            configRef.current ??
            createDefaultAppConfig();
          const newConfig = typeof update === 'function' ? update(current) : update;
          const saved = await window.electronAPI.config.set(newConfig);
          if (!saved) throw new Error('保存配置失败');
          applyConfig((await window.electronAPI.config.get()) ?? newConfig);
          setError(null);
          setSaveState('saved');
        } catch (err) {
          const message = err instanceof Error ? err.message : '保存配置失败';
          setError(message);
          setSaveState('error');
          throw new Error(message);
        } finally {
          setLoading(false);
        }
      });

      updateQueueRef.current = task.catch(() => undefined);
      return task;
    },
    [applyConfig]
  );

  const resetConfig = useCallback(async () => {
    setLoading(true);
    try {
      const defaultConfig = await window.electronAPI.config.reset();
      applyConfig(defaultConfig);
      setError(null);
      return defaultConfig;
    } catch (err) {
      const message = err instanceof Error ? err.message : '重置配置失败';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    fetchConfig();
    return window.electronAPI.on('event:config:changed', (value) =>
      applyConfig(value as AppConfig)
    );
  }, [fetchConfig, applyConfig]);

  return {
    saveState,
    config,
    loading,
    error,
    fetchConfig,
    updateConfig,
    resetConfig,
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.settings.get();
      setSettings(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取设置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (updates: Partial<AppSettings>) => {
    setLoading(true);
    try {
      const updated = await window.electronAPI.settings.update(updates);
      setSettings(updated);
      setError(null);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新设置失败';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    loading,
    error,
    fetchSettings,
    updateSettings,
  };
}
