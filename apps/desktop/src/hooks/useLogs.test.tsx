import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from '@repo/shared';
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
    vi.mocked(window.electronAPI.log.get).mockResolvedValue([initialLog]);
    vi.mocked(window.electronAPI.log.clear).mockResolvedValue(undefined);
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

  it('导出日志并透出失败信息', async () => {
    const { result } = renderHook(() => useLogs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.exportLogs('json')).resolves.toBe('exported');
    });
    expect(window.electronAPI.log.export).toHaveBeenCalledWith('json');

    vi.mocked(window.electronAPI.log.export).mockRejectedValue(new Error('磁盘已满'));
    await act(async () => {
      await expect(result.current.exportLogs()).rejects.toThrow('磁盘已满');
    });
    expect(result.current.error).toBe('磁盘已满');
  });

  it('加载和清除失败均不会伪造成功状态', async () => {
    vi.mocked(window.electronAPI.log.get).mockRejectedValue(new Error('读取失败'));
    const { result } = renderHook(() => useLogs());
    await waitFor(() => expect(result.current.error).toBe('读取失败'));

    vi.mocked(window.electronAPI.log.get).mockResolvedValue([initialLog]);
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
});
