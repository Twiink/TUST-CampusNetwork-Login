/**
 * 通知相关 IPC 处理
 */

import { ipcMain } from 'electron';
import { createLogger } from '@repo/shared';
import { NotificationService, NotificationOptions } from '../services/notification';
import { IPC_CHANNELS } from './channels';

/**
 * 注册通知 IPC 处理器
 */
export function registerNotificationIPC(
  notificationService: NotificationService,
  logger: ReturnType<typeof createLogger>
) {
  /**
   * 显示通知
   */
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATION_SHOW,
    async (_, options: NotificationOptions): Promise<boolean> => {
      try {
        return notificationService.show(options);
      } catch (error) {
        logger.error('显示通知失败', error);
        return false;
      }
    }
  );

  /**
   * 获取通知启用状态
   */
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION_GET_ENABLED, async (): Promise<boolean> => {
    return notificationService.isEnabled();
  });

  /**
   * 设置通知启用状态
   */
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATION_SET_ENABLED,
    async (_, enabled: boolean): Promise<boolean> => {
      try {
        notificationService.setEnabled(enabled);
        logger.info(`系统通知已${enabled ? '启用' : '禁用'}`);
        return true;
      } catch (error) {
        logger.error('设置通知状态失败', error);
        return false;
      }
    }
  );
}
