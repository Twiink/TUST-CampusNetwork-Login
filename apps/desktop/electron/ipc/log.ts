/**
 * 日志相关 IPC 处理
 */

import { ipcMain, BrowserWindow } from 'electron';
import { Logger, LogEntry, LogQueryOptions } from '@repo/shared';
import { IPC_CHANNELS, IPC_EVENTS } from './channels';

/**
 * 注册日志 IPC 处理器
 */
export function registerLogIPC(logger: Logger) {
  // 监听日志变化，推送到渲染进程
  logger.addListener((entry: LogEntry) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC_EVENTS.LOG_ADDED, entry);
    });
  });

  /**
   * 获取日志
   */
  ipcMain.handle(IPC_CHANNELS.LOG_GET, async (_, options?: LogQueryOptions): Promise<LogEntry[]> => {
    return logger.getLogs(options);
  });

  /**
   * 清除日志
   */
  ipcMain.handle(IPC_CHANNELS.LOG_CLEAR, async (): Promise<void> => {
    logger.clearLogs();
  });

  /**
   * 导出日志
   */
  ipcMain.handle(IPC_CHANNELS.LOG_EXPORT, async (_, format: 'text' | 'json' = 'text'): Promise<string> => {
    if (format === 'json') {
      return logger.exportAsJson();
    }
    return logger.exportAsText();
  });
}
