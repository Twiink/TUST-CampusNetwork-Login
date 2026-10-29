import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry, LogPage } from '@repo/shared';
import { IPC_EVENTS } from '../constants/ipc';
import { useLogs } from './useLogs';

const initialLog: LogEntry = {
  id: 'l1',
  level: 'info',
  message: '首次日志',
  timestamp: new Date('2026-01-01T08:00:00.000Z'),
};

describe('useLogs', () => {
  beforeEach(() => {
    vi.mocked(window.electronAPI.log.query).mockResolvedValue({
      entries: [initialLog],
      nextCursor: null,
      hasMore: false,
      total: 1,
    });
    vi.mocked(window.electronAPI.log.clear).mockResolvedValue('1');
    vi.mocked(window.electronAPI.log.export).mockResolvedValue('exported');
  });

  it('加载日志并把新批次按最新优先插入', async () => {
    let batchListener: ((entries: unknown) => void) | null = null;
    vi.mocked(window.electronAPI.on).mockImplementation((channel, callback) => {
      if (channel === IPC_EVENTS.LOG_BATCHED) {
        batchListener = callback;
      }
      return () => undefined;
    });
    const { result } = renderHook(() => useLogs());
    await waitFor(() => expect(result.current.logs).toEqual([initialLog]));

    act(() => {
      batchListener?.([
        { ...initialLog, id: 'l2', message: '较早批次' },
        { ...initialLog, id: 'l3', message: '最新批次' },
      ]);
    });

    expect(result.current.logs.map((entry) => entry.id)).toEqual(['l3', 'l2', 'l1']);
  });

  it('忽略空批次与非数组事件', async () => {
    let batchListener: ((entries: unknown) => void) | null = null;
    vi.mocked(window.electronAPI.on).mockImplementation((channel, callback) => {
      if (channel === IPC_EVENTS.LOG_BATCHED) batchListener = callback;
      return () => undefined;
    });
    const { result } = renderHook(() => useLogs());
    await waitFor(() => expect(result.current.logs).toEqual([initialLog]));

    act(() => {
      batchListener?.([]);
      batchListener?.('invalid');
    });
    expect(result.current.logs).toEqual([initialLog]);
  });

  it('清除日志后更新空状态', async () => {
    const { result } = renderHook(() => useLogs());
    await waitFor(() => expect(result.current.logs).toEqual([initialLog]));

    await act(async () => {
      await result.current.clearLogs();
    });

    expect(window.electronAPI.log.clear).toHaveBeenCalled();
    expect(result.current.logs).toEqual([]);
  });

  it('查看历史时缓冲新日志，点击后合并且按 ID 去重', async () => {
    let listener: ((entries: unknown) => void) | undefined;
    vi.mocked(window.electronAPI.on).mockImplementation((_, callback) => {
      listener = callback;
      return () => undefined;
    });
    const { result } = renderHook(() => useLogs());
    await waitFor(() => expect(result.current.logs).toHaveLength(1));
    act(() => {
      result.current.setFollowing(false);
      listener?.([{ ...initialLog, id: 'new' }]);
    });
    expect(result.current.logs).toHaveLength(1);
    expect(result.current.newCount).toBe(1);
    await act(async () => result.current.showNew());
    expect(result.current.logs).toHaveLength(2);
    expect(result.current.newCount).toBe(0);
  });

  it('加载和清除失败均不会伪造成功状态', async () => {
    vi.mocked(window.electronAPI.log.query).mockRejectedValue(new Error('读取失败'));
    const { result } = renderHook(() => useLogs());
    await waitFor(() => expect(result.current.error).toBe('读取失败'));

    vi.mocked(window.electronAPI.log.query).mockResolvedValue({
      entries: [initialLog],
      nextCursor: null,
      hasMore: false,
      total: 1,
    });
    await act(async () => {
      await result.current.fetchLogs();
    });
    vi.mocked(window.electronAPI.log.clear).mockRejectedValue(new Error('删除失败'));
    await act(async () => {
      await expect(result.current.clearLogs()).rejects.toThrow('删除失败');
    });
    expect(result.current.logs).toEqual([initialLog]);
    expect(result.current.error).toBe('删除失败');
  });

  it('N4: 窗口恢复时补齐超过一页的后台记录，并按 ID 合并', async () => {
    const entries = Array.from({ length: 651 }, (_, index) => ({
      ...initialLog,
      id: `log-${index}`,
      timestamp: new Date(Date.now() - index),
    }));
    vi.mocked(window.electronAPI.log.query).mockResolvedValueOnce({
      entries: entries.slice(650),
      total: 1,
      hasMore: false,
      nextCursor: null,
    });
    const { result } = renderHook(() => useLogs());
    await waitFor(() => expect(result.current.logs).toHaveLength(1));
    vi.mocked(window.electronAPI.log.query).mockImplementation(async (options) => {
      const offset = Number(options?.cursor ?? 0);
      return {
        entries: entries.slice(offset, offset + 200),
        nextCursor: String(offset + 200),
        hasMore: offset + 200 < entries.length,
        total: entries.length,
      };
    });
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(result.current.logs).toHaveLength(651));
    expect(new Set(result.current.logs.map((entry) => entry.id)).size).toBe(651);
  });

  it('清空时丢弃旧代次事件并保留新代次记录', async () => {
    let events: ((entries: unknown) => void) | undefined;
    vi.mocked(window.electronAPI.on).mockImplementation((_, callback) => {
      events = callback;
      return () => undefined;
    });
    vi.mocked(window.electronAPI.log.query).mockResolvedValue({
      entries: [initialLog],
      total: 1,
      hasMore: false,
      nextCursor: null,
      generation: '0',
    });
    let finish!: (generation: string) => void;
    vi.mocked(window.electronAPI.log.clear).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const { result } = renderHook(() => useLogs());
    await waitFor(() => expect(result.current.logs).toHaveLength(1));
    let clear!: Promise<void>;
    act(() => {
      clear = result.current.clearLogs();
      events?.([
        { ...initialLog, id: 'old', generation: '0' },
        { ...initialLog, id: 'new', generation: '1' },
      ]);
    });
    await act(async () => {
      finish('1');
      await clear;
    });
    expect(result.current.logs.map((entry) => entry.id)).toEqual(['new']);
    act(() => {
      result.current.setFollowing(false);
      events?.([{ ...initialLog, id: 'late-old', generation: '0' }]);
    });
    expect(result.current.newCount).toBe(0);
    expect(result.current.logs.map((entry) => entry.id)).toEqual(['new']);
  });

  it('初次持久查询返回时保留查询期间已收到的新日志', async () => {
    let events!: (value: unknown) => void;
    let finish!: (page: LogPage) => void;
    vi.mocked(window.electronAPI.on).mockImplementation((channel, callback) => {
      if (channel === IPC_EVENTS.LOG_BATCHED) events = callback;
      return () => undefined;
    });
    vi.mocked(window.electronAPI.log.query).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const { result } = renderHook(() => useLogs());
    act(() => events([{ ...initialLog, id: 'during-query' }]));
    await act(async () => {
      finish({ entries: [initialLog], total: 1, hasMore: false, nextCursor: null });
    });
    expect(result.current.logs.map((entry) => entry.id).sort()).toEqual(['during-query', 'l1']);
  });
});
