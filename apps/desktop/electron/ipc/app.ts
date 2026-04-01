/**
 * 应用级 IPC 处理
 */

import { app, ipcMain } from 'electron';
import { createLogger } from '@repo/shared';
import { IPC_CHANNELS } from './channels';
import { getResolvedAppVersion } from '../utils/app-version';

export function registerAppIPC(logger: ReturnType<typeof createLogger>) {
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async (): Promise<string> => {
    return getResolvedAppVersion();
  });

  ipcMain.handle(IPC_CHANNELS.APP_QUIT, async (): Promise<boolean> => {
    logger.info('收到渲染进程退出请求');
    app.quit();
    return true;
  });
}
