import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LogsScreen } from '../src/screens/LogsScreen';
import { useApp } from '../src/context/AppContext';

jest.mock('../src/context/AppContext', () => ({
  useApp: jest.fn(),
}));

const mockUseApp = useApp as jest.Mock;

jest.mock('../src/context/ThemeContext', () => {
  const { getTheme } = jest.requireActual('../src/constants/theme');
  return {
    useTheme: () => ({ theme: getTheme('dark'), themeMode: 'dark' }),
  };
});

const logs = [
  {
    id: 'l1',
    timestamp: '10:00:00',
    level: 'info' as const,
    message: '网络已连接',
  },
  {
    id: 'l2',
    timestamp: '10:00:01',
    level: 'error' as const,
    message: '认证失败',
  },
  {
    id: 'l3',
    timestamp: '10:00:02',
    level: 'success' as const,
    message: '登录成功',
  },
];

function renderLogs(customLogs = logs) {
  const clearLogs = jest.fn();
  mockUseApp.mockReturnValue({ logs: customLogs, clearLogs });
  return { ...render(<LogsScreen />), clearLogs };
}

describe('LogsScreen', () => {
  beforeEach(() => {
    mockUseApp.mockReset();
  });

  it('展示全部日志并可按级别筛选', () => {
    renderLogs();

    expect(screen.getByText('共 3 条')).toBeTruthy();
    expect(screen.getByText('网络已连接')).toBeTruthy();
    expect(screen.getByText('认证失败')).toBeTruthy();

    fireEvent.press(screen.getByText('错误'));
    expect(screen.getByText('共 1 条 (筛选自 3 条)')).toBeTruthy();
    expect(screen.getByText('认证失败')).toBeTruthy();
    expect(screen.queryByText('网络已连接')).toBeNull();
  });

  it('无日志时显示空态，存在日志时可清空', () => {
    const first = renderLogs([]);
    expect(screen.getByText('暂无日志记录')).toBeTruthy();
    expect(screen.queryByText('清空日志')).toBeNull();
    first.unmount();

    const second = renderLogs();
    fireEvent.press(screen.getByText('清空日志'));
    expect(second.clearLogs).toHaveBeenCalledTimes(1);
  });

  it('筛选结果为空时显示对应级别的空态', () => {
    renderLogs([
      {
        id: 'l1',
        timestamp: '10:00:00',
        level: 'info',
        message: '网络已连接',
      },
    ]);

    fireEvent.press(screen.getByText('错误'));
    expect(screen.getByText('暂无 错误 级别的日志')).toBeTruthy();
  });
});
