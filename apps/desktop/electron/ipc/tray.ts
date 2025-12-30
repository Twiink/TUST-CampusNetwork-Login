/**
 * 托盘相关 IPC 处理
 */

import { ipcMain } from 'electron';
import { createLogger } from '@repo/shared';
import { TrayService, TrayStatus } from '../services/tray';
import { IPC_CHANNELS } from './channels';

/**
 * 注册托盘 IPC 处理器
 */
export function registerTrayIPC(
  getTrayService: () => TrayService | null,
  logger: ReturnType<typeof createLogger>
) {
  /**
   * 更新托盘状态
   */
  ipcMain.handle(
    IPC_CHANNELS.TRAY_SET_STATUS,
    async (_, status: TrayStatus): Promise<boolean> => {
      try {
        const trayService = getTrayService();
        if (trayService) {
          trayService.setStatus(status);
          logger.debug(`托盘状态已更新: ${status}`);
          return true;
        }
        return false;
      } catch (error) {
        logger.error('更新托盘状态失败', error);
        return false;
      }
    }
  );

  /**
   * 获取托盘状态
   */
  ipcMain.handle(IPC_CHANNELS.TRAY_GET_STATUS, async (): Promise<TrayStatus> => {
    try {
      const trayService = getTrayService();
      return trayService?.getStatus() || 'disconnected';
    } catch {
      return 'disconnected';
    }
  });
}
