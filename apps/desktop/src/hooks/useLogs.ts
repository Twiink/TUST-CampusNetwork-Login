/**
 * 日志 Hook
 */

import { useState, useCallback, useEffect } from 'react';
import type { LogEntry, LogQueryOptions } from '@repo/shared';
import { IPC_EVENTS } from '../types/electron.d';

export function useLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (options?: LogQueryOptions) => {
    setLoading(true);
    try {
      const data = await window.electronAPI.log.get(options);
      setLogs(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取日志失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearLogs = useCallback(async () => {
    setLoading(true);
    try {
      await window.electronAPI.log.clear();
      setLogs([]);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '清除日志失败';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const exportLogs = useCallback(async (format: 'text' | 'json' = 'text'): Promise<string> => {
    try {
      return await window.electronAPI.log.export(format);
    } catch (err) {
      const message = err instanceof Error ? err.message : '导出日志失败';
      setError(message);
      throw new Error(message);
    }
  }, []);

  // 监听新日志
  useEffect(() => {
    const unsubscribe = window.electronAPI.on(IPC_EVENTS.LOG_ADDED, (entry: unknown) => {
      setLogs((prev) => [entry as LogEntry, ...prev].slice(0, 500));
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 初始获取
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    loading,
    error,
    fetchLogs,
    clearLogs,
    exportLogs,
  };
}
