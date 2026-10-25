/**
 * 日志批量广播测试：250ms 合并、隐藏窗口不发送
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleMock: vi.fn(),
  getAllWindowsMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handleMock },
  BrowserWindow: { getAllWindows: mocks.getAllWindowsMock },
  dialog: {},
  shell: {},
  app: { getPath: vi.fn(() => '/tmp/netmate-test') },
}));

import { registerLogIPC } from './log';
import { IPC_CHANNELS, IPC_EVENTS } from './channels';
import type { LogEntry, Logger } from '@repo/shared';

describe('日志批量广播', () => {
  const listeners = new Set<(entry: LogEntry) => void>();
  const makeLogger = () =>
    ({
      addListener: (listener: (entry: LogEntry) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    }) as unknown as Logger;

  const makeWindow = (visible: boolean) => {
    const send = vi.fn();
    return {
      send,
      window: {
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => visible),
        webContents: { send },
      },
    };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    listeners.clear();
    mocks.handleMock.mockImplementation(() => {});
    registerLogIPC(makeLogger());
  });

  it('250ms 内多条日志只跨一次 IPC，并按顺序批量发送', async () => {
    const { window, send } = makeWindow(true);
    mocks.getAllWindowsMock.mockReturnValue([window]);

    listeners.forEach((listener) => {
      listener({ id: '1', message: 'one' } as LogEntry);
      listener({ id: '2', message: 'two' } as LogEntry);
    });
    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(IPC_EVENTS.LOG_BATCHED, [
      expect.objectContaining({ id: '1' }),
      expect.objectContaining({ id: '2' }),
    ]);
  });

  it('隐藏或已销毁窗口不发送日志事件', async () => {
    const visible = makeWindow(true);
    const hidden = makeWindow(false);
    const destroyed = {
      isDestroyed: vi.fn(() => true),
      isVisible: vi.fn(() => true),
      webContents: { send: vi.fn() },
    };
    mocks.getAllWindowsMock.mockReturnValue([visible.window, hidden.window, destroyed]);

    listeners.forEach((listener) => listener({ id: '1' } as LogEntry));
    await vi.advanceTimersByTimeAsync(250);

    expect(visible.send).toHaveBeenCalledTimes(1);
    expect(hidden.send).not.toHaveBeenCalled();
    expect(destroyed.webContents.send).not.toHaveBeenCalled();
  });

  it('IPC 处理器仍按通道注册', () => {
    const channels = mocks.handleMock.mock.calls.map(([channel]) => channel);
    expect(channels).toContain(IPC_CHANNELS.LOG_GET);
    expect(channels).toContain(IPC_CHANNELS.LOG_EXPORT_SAVE);
  });
});
