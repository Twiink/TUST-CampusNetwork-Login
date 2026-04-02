/**
 * 日志相关 IPC 处理
 */

import { ipcMain, BrowserWindow, dialog } from 'electron';
import * as fs from 'node:fs/promises';
import { Logger, LogEntry, LogQueryOptions } from '@repo/shared';
import { IPC_CHANNELS, IPC_EVENTS } from './channels';
import { collectSystemInfo } from '../services/system-info';

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
  ipcMain.handle(
    IPC_CHANNELS.LOG_GET,
    async (_, options?: LogQueryOptions): Promise<LogEntry[]> => {
      return logger.getLogs(options);
    }
  );

  /**
   * 清除日志
   */
  ipcMain.handle(IPC_CHANNELS.LOG_CLEAR, async (): Promise<void> => {
    logger.clearLogs();
  });

  /**
   * 导出日志（返回字符串内容）
   */
  ipcMain.handle(
    IPC_CHANNELS.LOG_EXPORT,
    async (_, format: 'text' | 'json' = 'text'): Promise<string> => {
      if (format === 'json') {
        return logger.exportAsJson();
      }
      return logger.exportAsText();
    }
  );

  /**
   * 导出日志并保存到文件（含系统信息采集）
   */
  ipcMain.handle(
    IPC_CHANNELS.LOG_EXPORT_SAVE,
    async (
      _,
      format: 'text' | 'json' = 'text'
    ): Promise<{ success: boolean; path?: string; error?: string }> => {
      try {
        // 采集系统信息
        const systemInfo = await collectSystemInfo();

        // 生成导出内容
        const content =
          format === 'json'
            ? logger.exportAsJson(systemInfo)
            : logger.exportAsText(systemInfo);

        // 生成默认文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const ext = format === 'json' ? 'json' : 'log';
        const defaultFileName = `netmate-logs-${timestamp}.${ext}`;

        // 弹出保存对话框
        const win = BrowserWindow.getFocusedWindow();
        const result = await dialog.showSaveDialog(win!, {
          title: '导出诊断日志',
          defaultPath: defaultFileName,
          filters:
            format === 'json'
              ? [{ name: 'JSON 文件', extensions: ['json'] }]
              : [{ name: '日志文件', extensions: ['log', 'txt'] }],
        });

        if (result.canceled || !result.filePath) {
          return { success: false, error: '用户取消导出' };
        }

        // 写入文件
        await fs.writeFile(result.filePath, content, 'utf-8');

        return { success: true, path: result.filePath };
      } catch (err) {
        const message = err instanceof Error ? err.message : '导出失败';
        return { success: false, error: message };
      }
    }
  );
}
