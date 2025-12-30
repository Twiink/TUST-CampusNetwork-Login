/**
 * 更新相关 IPC 处理
 */

import { ipcMain } from 'electron';
import { createLogger } from '@repo/shared';
import { UpdaterService, UpdateStatus } from '../services/updater';
import { IPC_CHANNELS } from './channels';

/**
 * 注册更新 IPC 处理器
 */
export function registerUpdaterIPC(
  updaterService: UpdaterService,
  logger: ReturnType<typeof createLogger>
) {
  /**
   * 检查更新
   */
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async (): Promise<boolean> => {
    try {
      await updaterService.checkForUpdates();
      return true;
    } catch (error) {
      logger.error('检查更新失败', error);
      return false;
    }
  });

  /**
   * 下载更新
   */
  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async (): Promise<boolean> => {
    try {
      await updaterService.downloadUpdate();
      return true;
    } catch (error) {
      logger.error('下载更新失败', error);
      return false;
    }
  });

  /**
   * 安装更新
   */
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, async (): Promise<void> => {
    try {
      updaterService.quitAndInstall();
    } catch (error) {
      logger.error('安装更新失败', error);
      throw error;
    }
  });

  /**
   * 获取更新状态
   */
  ipcMain.handle(IPC_CHANNELS.UPDATE_STATUS, async (): Promise<UpdateStatus> => {
    return updaterService.getStatus();
  });
}
