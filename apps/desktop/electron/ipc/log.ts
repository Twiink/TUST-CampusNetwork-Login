import { runtimePorts } from '../runtime-ports';
/**
 * 日志相关 IPC 处理
 */

import { ipcMain, BrowserWindow, dialog, shell, app } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  Logger,
  LogEntry,
  LogQueryOptions,
  LogHistoryQuery,
  LogHistoryFilter,
  matchesLog,
  queryLogPage,
  exportLogHistory,
} from '@repo/shared';
import { IPC_CHANNELS, IPC_EVENTS } from './channels';
import type { FileLogger } from '../services/file-logger';
import { collectSystemInfo } from '../services/system-info';

/**
 * 注册日志 IPC 处理器
 */
export function registerLogIPC(logger: Logger, journal?: FileLogger) {
  // 日志合并推送：突发写入只跨一次 IPC，且隐藏窗口不产生渲染端唤醒。
  const pendingEntries: LogEntry[] = [];
  let generation = 0;
  const all = async () => {
    const snapshot = journal ? await journal.all() : { entries: logger.getAllLogs() };
    if (snapshot.error) throw new Error(snapshot.error);
    return snapshot.entries;
  };
  const content = async (format: 'text' | 'json', filter: LogHistoryFilter = {}) =>
    exportLogHistory(
      (await all()).filter((entry) => matchesLog(entry, filter)),
      format,
      await collectSystemInfo()
    );
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    flushTimer = null;
    if (pendingEntries.length === 0) {
      return;
    }
    const entries = pendingEntries.splice(0, pendingEntries.length);
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed() && win.isVisible()) {
        win.webContents.send(IPC_EVENTS.LOG_BATCHED, entries);
      }
    });
  };

  logger.addListener((entry: LogEntry) => {
    pendingEntries.push({ ...entry, generation: String(generation) });
    if (!flushTimer) {
      flushTimer = setTimeout(flush, 250);
    }
  });

  /**
   * 获取日志
   */
  ipcMain.handle(
    IPC_CHANNELS.LOG_GET,
    async (_, options?: LogQueryOptions): Promise<LogEntry[]> => {
      const entries = await all();
      return entries
        .filter((entry) =>
          matchesLog(entry, {
            ...options,
            startTime: options?.startTime ? new Date(options.startTime).getTime() : undefined,
            endTime: options?.endTime ? new Date(options.endTime).getTime() : undefined,
          })
        )
        .slice(
          options?.offset ?? 0,
          options?.limit ? (options.offset ?? 0) + options.limit : undefined
        );
    }
  );

  ipcMain.handle(IPC_CHANNELS.LOG_QUERY, async (_, options: LogHistoryQuery = {}) => ({
    ...(journal ? await journal.query(options) : queryLogPage(logger.getAllLogs(), options)),
    generation: String(generation),
  }));

  /**
   * 清除日志
   */
  ipcMain.handle(IPC_CHANNELS.LOG_CLEAR, async (): Promise<string> => {
    generation++;
    pendingEntries.length = 0;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    logger.clearLogs();
    await journal?.clear();
    return String(generation);
  });

  /**
   * 导出日志（返回字符串内容）
   */
  ipcMain.handle(
    IPC_CHANNELS.LOG_EXPORT,
    async (_, format: 'text' | 'json' = 'text', filter?: LogHistoryFilter): Promise<string> =>
      content(format, filter)
  );

  /**
   * 导出日志并保存到文件（含系统信息采集）
   */
  ipcMain.handle(
    IPC_CHANNELS.LOG_EXPORT_SAVE,
    async (
      _,
      format: 'text' | 'json' = 'text',
      filter?: LogHistoryFilter
    ): Promise<{ success: boolean; path?: string; error?: string }> => {
      try {
        const exported = await content(format, filter);

        // 生成默认文件名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const ext = format === 'json' ? 'json' : 'log';
        const defaultFileName = `netmate-logs-${timestamp}.${ext}`;

        // 弹出保存对话框
        const win = BrowserWindow.getFocusedWindow();
        const result = runtimePorts.saveLogPath
          ? { canceled: false, filePath: await runtimePorts.saveLogPath(ext) }
          : await dialog.showSaveDialog(win!, {
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
        await fs.writeFile(result.filePath, exported, 'utf-8');

        return { success: true, path: result.filePath };
      } catch (err) {
        const message = err instanceof Error ? err.message : '导出失败';
        return { success: false, error: message };
      }
    }
  );

  /**
   * 打开日志目录（userData/logs，与 FileLogger 落盘路径一致）
   * 在系统文件管理器中定位日志文件，方便用户排查问题。
   */
  ipcMain.handle(
    IPC_CHANNELS.LOG_OPEN_DIR,
    async (): Promise<{ success: boolean; path?: string; error?: string }> => {
      try {
        const logDir = path.join(app.getPath('userData'), 'logs');
        // 目录可能尚未创建（如刚启动无日志写入），先确保存在再打开
        await fs.mkdir(logDir, { recursive: true });
        const errMsg = await (runtimePorts.openPath ?? shell.openPath)(logDir);
        if (errMsg) {
          return { success: false, error: errMsg };
        }
        return { success: true, path: logDir };
      } catch (err) {
        const message = err instanceof Error ? err.message : '打开日志目录失败';
        return { success: false, error: message };
      }
    }
  );
}
