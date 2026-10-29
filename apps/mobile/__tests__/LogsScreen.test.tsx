import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { matchesLog, type LogHistoryFilter } from '@repo/shared';
import { LogsScreen } from '../src/screens/LogsScreen';
import { useApp } from '../src/context/AppContext';
import { copyLog } from '../src/native/Logs';
import { useTheme } from '../src/context/ThemeContext';
import { getTheme } from '../src/constants/theme';

jest.mock('../src/context/AppContext', () => ({ useApp: jest.fn() }));
jest.mock('../src/native/Logs', () => ({ copyLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/context/ThemeContext', () => ({
  useTheme: jest.fn(() => ({
    theme: jest.requireActual('../src/constants/theme').getTheme('dark'),
    themeMode: 'dark',
  })),
}));
const logs = [
  {
    id: 'l1',
    timestamp: Date.now() - 2000,
    level: 'info' as const,
    source: 'wifi',
    message: '网络已连接',
  },
  {
    id: 'l2',
    timestamp: Date.now() - 1000,
    level: 'error' as const,
    source: 'auth',
    message: '认证失败',
    data: { reason: '门户没有响应' },
  },
  {
    id: 'l3',
    timestamp: Date.now(),
    level: 'success' as const,
    source: 'auth',
    message: '登录成功',
  },
];
function renderLogs(initial = logs, error: string | null = null) {
  const queryLogs = jest.fn<Promise<void>, [LogHistoryFilter]>();
  const clearLogs = jest.fn<Promise<void>, []>();
  const exportLogs = jest.fn().mockResolvedValue('/fixture/log.json');
  const loadMoreLogs = jest.fn().mockResolvedValue(undefined);
  const refreshLogs = jest.fn().mockResolvedValue(undefined);
  (useApp as jest.Mock).mockImplementation(() => {
    const [entries, setEntries] = React.useState(initial);
    queryLogs.mockImplementation(async filter => {
      setEntries(initial.filter(entry => matchesLog(entry, filter)));
    });
    clearLogs.mockImplementation(async () => {
      setEntries([]);
    });
    return {
      logs: entries,
      clearLogs,
      exportLogs,
      queryLogs,
      loadMoreLogs,
      refreshLogs,
      logsTotal: entries.length,
      hasMoreLogs: true,
      logsLoading: false,
      logError: error,
    };
  });
  return { ...render(<LogsScreen />), queryLogs, clearLogs, exportLogs, loadMoreLogs, refreshLogs };
}
beforeEach(() => {
  jest.clearAllMocks();
  (useTheme as jest.Mock).mockReturnValue({ theme: getTheme('dark'), themeMode: 'dark' });
});
it('查询持久历史并把级别、关键词和来源筛选提交给服务', async () => {
  const view = renderLogs();
  expect(await screen.findByText('共 3 条，已加载 3 条')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('错误', { exact: true }));
  await waitFor(() =>
    expect(view.queryLogs).toHaveBeenLastCalledWith({ level: 'error', keyword: '' })
  );
  expect(screen.queryByText('网络已连接')).toBeNull();
  expect(screen.getByText('认证失败')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('搜索全部历史日志'), '门户');
  fireEvent.press(screen.getByText('筛选'));
  fireEvent.changeText(screen.getByLabelText('来源'), 'auth');
  fireEvent.press(screen.getByText('应用筛选'));
  await waitFor(() =>
    expect(view.queryLogs).toHaveBeenLastCalledWith(
      expect.objectContaining({ level: 'error', keyword: '门户', source: 'auth' })
    )
  );
  expect(screen.getByText('认证失败')).toBeTruthy();
});
it('无日志和无匹配结果有对应空态，清空等待持久操作', async () => {
  const empty = renderLogs([]);
  expect(await screen.findByText('暂无日志记录')).toBeTruthy();
  expect(screen.getByRole('button', { name: '清空日志' }).props.accessibilityState.disabled).toBe(
    true
  );
  empty.unmount();
  const view = renderLogs();
  fireEvent.press(screen.getByText('调试'));
  expect(await screen.findByText('没有匹配的日志')).toBeTruthy();
  fireEvent.press(screen.getByText('全部'));
  fireEvent.press(screen.getByText('清空日志'));
  await waitFor(() => expect(view.clearLogs).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('暂无日志记录')).toBeTruthy();
});
it('默认导出完整历史，也可导出筛选 JSON 并呈现导出错误', async () => {
  const view = renderLogs();
  fireEvent.press(screen.getByText('导出日志'));
  await waitFor(() => expect(view.exportLogs).toHaveBeenCalledWith('text', undefined));
  await screen.findByText('导出文件已生成，请在系统分享面板中保存或分享');
  fireEvent.press(screen.getByLabelText('错误', { exact: true }));
  fireEvent.press(screen.getByText('当前筛选结果'));
  fireEvent.press(screen.getByText('JSON'));
  view.exportLogs.mockRejectedValueOnce(new Error('文件写入失败'));
  fireEvent.press(screen.getByText('导出日志'));
  expect(await screen.findByText('文件写入失败')).toBeTruthy();
  expect(view.exportLogs).toHaveBeenLastCalledWith('json', { level: 'error', keyword: '' });
});
it('详情保留结构化数据并支持复制，历史加载与刷新可达', async () => {
  const view = renderLogs();
  fireEvent.press(screen.getByText('认证失败'));
  expect(screen.getByText('日志详情')).toBeTruthy();
  expect(screen.getByText(/"reason": "门户没有响应"/)).toBeTruthy();
  fireEvent.press(screen.getByText('复制详情'));
  await waitFor(() =>
    expect(copyLog).toHaveBeenCalledWith(expect.stringContaining('门户没有响应'))
  );
  fireEvent.press(screen.getByText('关闭详情'));
  fireEvent.press(screen.getByText('加载历史日志'));
  fireEvent.press(screen.getByText('刷新'));
  expect(view.loadMoreLogs).toHaveBeenCalledTimes(1);
  expect(view.refreshLogs).toHaveBeenCalledTimes(1);
});
it('读取失败仍显示已有内容并可刷新', () => {
  renderLogs(logs, '读取历史文件失败');
  expect(screen.getByText('读取历史文件失败')).toBeTruthy();
  expect(screen.getByText('认证失败')).toBeTruthy();
});

it.each(['light', 'dark'] as const)(
  '%s 主题下保留完整长文本，详情复制的反馈直接可见',
  async mode => {
    (useTheme as jest.Mock).mockReturnValue({ theme: getTheme(mode), themeMode: mode });
    const longMessage = '已认证，正在确认互联网连接。'.repeat(80);
    renderLogs([{ ...logs[1], message: longMessage }]);
    expect(screen.getByRole('button', { name: '筛选' })).toHaveStyle({ minHeight: 44 });
    fireEvent.press(screen.getByText(longMessage));
    const modal = screen
      .UNSAFE_getAllByType(Modal)
      .find(instance => instance.props.visible && !instance.props.transparent)!;
    const detail = within(modal);
    expect(detail.getByText(longMessage)).toHaveStyle({ color: getTheme(mode).colors.text });
    fireEvent.press(detail.getByText('复制详情'));
    expect(await detail.findByText('已复制日志详情')).toBeTruthy();
    expect(copyLog).toHaveBeenLastCalledWith(expect.stringContaining(longMessage));
  }
);
