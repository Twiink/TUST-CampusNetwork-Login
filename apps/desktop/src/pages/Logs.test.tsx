import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesLog, type LogHistoryFilter, type LogEntry } from '@repo/shared';
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
    useLogsMock.mockImplementation((filter: LogHistoryFilter) => {
      const filtered = entries.filter((entry) => matchesLog(entry, filter));
      return {
        logs: filtered,
        total: filtered.length,
        clearLogs,
        setFollowing: vi.fn(),
        loading: false,
        fetchLogs: vi.fn(),
        showNew: vi.fn(),
      };
    });
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
    expect(screen.getByText(/共 1 条/)).toBeTruthy();
  });

  it('无匹配级别时显示明确空状态', () => {
    renderLogs();
    fireEvent.click(screen.getByRole('button', { name: '调试' }));
    expect(screen.getByText('没有匹配的日志')).toBeTruthy();
  });

  it('调用两种导出格式并处理导出失败', async () => {
    renderLogs();
    fireEvent.click(screen.getByRole('button', { name: '导出日志' }));
    await waitFor(() =>
      expect(window.electronAPI.log.exportSave).toHaveBeenCalledWith('text', undefined)
    );

    await waitFor(() =>
      expect((screen.getByRole('button', { name: '导出日志' }) as HTMLButtonElement).disabled).toBe(
        false
      )
    );
    fireEvent.change(screen.getByLabelText('导出格式'), { target: { value: 'json' } });
    vi.mocked(window.electronAPI.log.exportSave).mockResolvedValueOnce({
      success: false,
      error: '没有写入权限',
    });
    fireEvent.click(screen.getByRole('button', { name: '导出日志' }));

    expect((await screen.findByRole('alert')).textContent).toContain('没有写入权限');
    expect(window.electronAPI.log.exportSave).toHaveBeenCalledWith('json', undefined);
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
    expect((screen.getByRole('button', { name: '导出日志' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect((screen.getByRole('button', { name: '导出日志' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect((screen.getByRole('button', { name: /清除日志/ }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('筛选无结果仍可导出全部历史，当前筛选导出传递相同条件', async () => {
    renderLogs();
    fireEvent.click(screen.getByRole('button', { name: '调试' }));
    expect(screen.getByText('没有匹配的日志')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '导出日志' }));
    await waitFor(() =>
      expect(window.electronAPI.log.exportSave).toHaveBeenCalledWith('text', undefined)
    );
    fireEvent.click(screen.getByRole('button', { name: '错误' }));
    fireEvent.change(screen.getByLabelText('导出范围'), { target: { value: 'filtered' } });
    fireEvent.click(screen.getByRole('button', { name: '导出日志' }));
    await waitFor(() =>
      expect(window.electronAPI.log.exportSave).toHaveBeenLastCalledWith(
        'text',
        expect.objectContaining({ level: 'error' })
      )
    );
  });

  it('详情完整显示长文本和结构化数据，复制反馈可见', async () => {
    const longMessage = '门户已认证，但互联网不可达。'.repeat(80);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderLogs([
      {
        ...logs[0],
        message: longMessage,
        source: '恢复编排',
        data: { checks: 3, next: '备用网络' },
      },
    ]);
    fireEvent.click(screen.getByText(longMessage));
    const details = screen.getByRole('complementary', { name: '日志详情' });
    expect(details.textContent).toContain(longMessage);
    expect(details.textContent).toContain('"checks": 3');
    fireEvent.click(screen.getByRole('button', { name: '复制详情' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining(longMessage))
    );
    expect(await screen.findByText('已复制日志详情')).toBeTruthy();
  });
});
