import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from '@repo/shared';
import { Logs } from './Logs';

const { useLogsMock } = vi.hoisted(() => ({
  useLogsMock: vi.fn(),
}));

vi.mock('../hooks/useLogs', () => ({
  useLogs: useLogsMock,
}));

const logs: LogEntry[] = [
  {
    id: 'l1',
    level: 'info',
    message: '网络已连接',
    timestamp: new Date('2026-10-26T10:00:00.000Z'),
  },
  {
    id: 'l2',
    level: 'error',
    message: '认证失败',
    timestamp: new Date('2026-10-26T10:01:00.000Z'),
  },
];

describe('Logs', () => {
  const clearLogs = vi.fn<() => Promise<void>>();

  function renderLogs(entries = logs) {
    useLogsMock.mockReturnValue({ logs: entries, clearLogs });
    return render(<Logs />);
  }

  beforeEach(() => {
    clearLogs.mockReset();
    clearLogs.mockResolvedValue(undefined);
    useLogsMock.mockReset();
    vi.mocked(window.electronAPI.log.exportSave).mockResolvedValue({ success: true });
    vi.mocked(window.electronAPI.log.openDir).mockResolvedValue({ success: true });
  });

  it('渲染日志并按级别筛选与显示筛选计数', () => {
    renderLogs();

    expect(screen.getByText('网络已连接')).toBeTruthy();
    expect(screen.getByText('认证失败')).toBeTruthy();
    expect(screen.getByText(/共 2 条/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '错误' }));

    expect(screen.queryByText('网络已连接')).toBeNull();
    expect(screen.getByText('认证失败')).toBeTruthy();
    expect(screen.getByText(/共 1 条.*筛选自 2 条/)).toBeTruthy();
  });

  it('无匹配级别时显示明确空状态', () => {
    renderLogs();
    fireEvent.click(screen.getByRole('button', { name: '调试' }));
    expect(screen.getByText('暂无 调试 级别的日志')).toBeTruthy();
  });

  it('调用两种导出格式并处理导出失败', async () => {
    renderLogs();
    fireEvent.click(screen.getByRole('button', { name: /导出 LOG/ }));
    await waitFor(() => expect(window.electronAPI.log.exportSave).toHaveBeenCalledWith('text'));

    vi.mocked(window.electronAPI.log.exportSave).mockResolvedValueOnce({
      success: false,
      error: '没有写入权限',
    });
    fireEvent.click(screen.getByRole('button', { name: /导出 JSON/ }));

    expect((await screen.findByRole('alert')).textContent).toContain('没有写入权限');
    expect(window.electronAPI.log.exportSave).toHaveBeenCalledWith('json');
  });

  it('打开日志目录并根据主进程结果展示错误', async () => {
    renderLogs();
    fireEvent.click(screen.getByRole('button', { name: /日志目录/ }));
    await waitFor(() => expect(window.electronAPI.log.openDir).toHaveBeenCalledTimes(1));

    vi.mocked(window.electronAPI.log.openDir).mockRejectedValueOnce(new Error('文件管理器不可用'));
    fireEvent.click(screen.getByRole('button', { name: /日志目录/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('文件管理器不可用');
  });

  it('清除日志成功调用 Hook，失败不会产生未处理异常', async () => {
    renderLogs();
    fireEvent.click(screen.getByRole('button', { name: /清除日志/ }));
    await waitFor(() => expect(clearLogs).toHaveBeenCalledTimes(1));

    clearLogs.mockRejectedValueOnce(new Error('日志文件被占用'));
    fireEvent.click(screen.getByRole('button', { name: /清除日志/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('日志文件被占用');
  });

  it('空日志时导出与清除按钮禁用', () => {
    renderLogs([]);
    expect(screen.getByText('暂无日志记录')).toBeTruthy();
    expect((screen.getByRole('button', { name: /导出 LOG/ }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect((screen.getByRole('button', { name: /导出 JSON/ }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect((screen.getByRole('button', { name: /清除日志/ }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});
