/**
 * 开机自启相关 IPC 处理
 */

import { ipcMain } from 'electron';
import { createLogger } from '@repo/shared';
import { AutoLaunchService } from '../services/auto-launch';
import { IPC_CHANNELS } from './channels';

/**
 * 注册开机自启 IPC 处理器
 */
export function registerAutoLaunchIPC(
  autoLaunchService: AutoLaunchService,
  logger: ReturnType<typeof createLogger>
) {
  /**
   * 获取开机自启状态
   */
  ipcMain.handle(IPC_CHANNELS.AUTO_LAUNCH_GET, async (): Promise<boolean> => {
    try {
      return await autoLaunchService.isEnabled();
    } catch (error) {
      logger.error('获取开机自启状态失败', error);
      return false;
    }
  });

  /**
   * 设置开机自启状态
   */
  ipcMain.handle(
    IPC_CHANNELS.AUTO_LAUNCH_SET,
    async (_, enabled: boolean): Promise<boolean> => {
      try {
        const result = await autoLaunchService.setEnabled(enabled);
        if (result) {
          logger.info(`开机自启已${enabled ? '启用' : '禁用'}`);
        }
        return result;
      } catch (error) {
        logger.error('设置开机自启状态失败', error);
        return false;
      }
    }
  );
}
