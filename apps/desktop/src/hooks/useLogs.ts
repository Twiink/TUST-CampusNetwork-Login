import { useState, useCallback, useEffect, useRef } from 'react';
import { matchesLog, mergeLogs, type LogEntry, type LogHistoryFilter } from '@repo/shared';
import { IPC_EVENTS } from '../constants/ipc';

export function useLogs(filter: LogHistoryFilter = {}) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const logsRef = useRef(logs);
  logsRef.current = logs;
  const cursor = useRef<string | null>(null);
  const epoch = useRef(0);
  const generation = useRef<string | undefined>(undefined);
  const clearing = useRef(false);
  const pending = useRef(new Map<string, LogEntry>());
  const queryEvents = useRef<Map<string, LogEntry> | null>(null);
  const following = useRef(true);
  const filterKey = JSON.stringify(filter);
  const activeFilter = useRef(filter);
  activeFilter.current = filter;
  const fetchLogs = useCallback(async (mode: 'query' | 'refresh' | 'more' = 'refresh') => {
    if (mode === 'query') {
      epoch.current++;
      cursor.current = null;
      pending.current.clear();
      queryEvents.current = new Map();
      setNewCount(0);
    }
    const request = epoch.current;
    setLoading(true);
    try {
      const page = await window.electronAPI.log.query({
        ...activeFilter.current,
        cursor: mode === 'more' ? cursor.current : null,
        limit: 200,
      });
      if (request !== epoch.current) return;
      if (mode === 'refresh' && logsRef.current.length) {
        const known = new Set(logsRef.current.map((entry) => entry.id));
        let chunk = page;
        while (chunk.hasMore && !chunk.entries.some((entry) => known.has(entry.id))) {
          chunk = await window.electronAPI.log.query({
            ...activeFilter.current,
            cursor: chunk.nextCursor,
            limit: 200,
          });
          if (request !== epoch.current) return;
          page.entries.push(...chunk.entries);
        }
        page.nextCursor = chunk.nextCursor;
        page.hasMore = chunk.hasMore;
      }
      generation.current = page.generation;
      if (mode !== 'refresh' || cursor.current === null) {
        cursor.current = page.nextCursor;
        setHasMore(page.hasMore);
      }
      setTotal(page.total);
      setError(page.error ?? null);
      if (mode === 'refresh' && !following.current) {
        setLogs((previous) => {
          const ids = new Set(previous.map((entry) => entry.id));
          page.entries
            .filter((entry) => !ids.has(entry.id))
            .forEach((entry) => pending.current.set(entry.id, entry));
          setNewCount(pending.current.size);
          return previous;
        });
      } else {
        const received = mode === 'query' ? [...(queryEvents.current?.values() ?? [])] : [];
        if (mode === 'query') queryEvents.current = null;
        setLogs((previous) => mergeLogs(mode === 'query' ? [] : previous, page.entries, received));
      }
    } catch (err) {
      if (request === epoch.current)
        setError(err instanceof Error ? err.message : '日志读取失败，请刷新重试');
    } finally {
      if (request === epoch.current) {
        if (mode === 'query') queryEvents.current = null;
        setLoading(false);
      }
    }
  }, []);
  const showNew = useCallback(() => {
    following.current = true;
    const added = [...pending.current.values()];
    setLogs((previous) => mergeLogs(previous, added));
    pending.current.clear();
    setNewCount(0);
    void fetchLogs();
  }, [fetchLogs]);
  const clearLogs = useCallback(async () => {
    epoch.current++;
    queryEvents.current = null;
    clearing.current = true;
    pending.current.clear();
    setLoading(true);
    try {
      generation.current = await window.electronAPI.log.clear();
      const added = [...pending.current.values()].filter(
        (entry) => entry.generation === generation.current
      );
      setLogs(mergeLogs(added));
      setTotal(added.length);
      setHasMore(false);
      cursor.current = null;
      setError(null);
      setNewCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : '日志清空失败，请重试');
      throw err;
    } finally {
      clearing.current = false;
      pending.current.clear();
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const cancelRequests = () => {
      epoch.current++;
    };
    const unsubscribe = window.electronAPI.on(IPC_EVENTS.LOG_BATCHED, (value: unknown) => {
      const entries = (Array.isArray(value) ? (value as LogEntry[]) : []).filter(
        (entry) =>
          matchesLog(entry, activeFilter.current) &&
          (clearing.current || !generation.current || entry.generation === generation.current)
      );
      entries.forEach((entry) => queryEvents.current?.set(entry.id, entry));
      if (clearing.current || !following.current) {
        entries.forEach((entry) => pending.current.set(entry.id, entry));
        setNewCount(pending.current.size);
      } else setLogs((previous) => mergeLogs(previous, entries));
    });
    const refresh = () => {
      if (!document.hidden) void fetchLogs();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      cancelRequests();
    };
  }, [fetchLogs]);
  useEffect(() => {
    void fetchLogs('query');
  }, [filterKey, fetchLogs]);
  return {
    logs,
    total,
    hasMore,
    loading,
    error,
    newCount,
    showNew,
    fetchLogs,
    clearLogs,
    setFollowing: (value: boolean) => {
      following.current = value;
    },
  };
}
