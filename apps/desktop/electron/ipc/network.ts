/**
 * 网络相关 IPC 处理
 */

import { ipcMain, BrowserWindow } from 'electron';
import { NetworkDetector, NetworkStatus, createLogger } from '@repo/shared';
import { getNetworkInfo } from '../services/network';
import { IPC_CHANNELS, IPC_EVENTS } from './channels';

/**
 * 注册网络 IPC 处理器
 */
export function registerNetworkIPC(
  networkDetector: NetworkDetector,
  logger: ReturnType<typeof createLogger>
) {
  /**
   * 获取网络状态
   */
  ipcMain.handle(IPC_CHANNELS.NETWORK_STATUS, async (): Promise<NetworkStatus> => {
    try {
      return await networkDetector.getNetworkStatus();
    } catch (error) {
      logger.error('获取网络状态失败', error);
      return { connected: false, authenticated: false };
    }
  });

  /**
   * 获取网络信息 (IP/MAC)
   */
  ipcMain.handle(IPC_CHANNELS.NETWORK_INFO, async () => {
    return getNetworkInfo();
  });

  /**
   * 检查网络连通性
   */
  ipcMain.handle(IPC_CHANNELS.NETWORK_CHECK, async (): Promise<boolean> => {
    try {
      return await networkDetector.checkConnectivity();
    } catch {
      return false;
    }
  });
}

/**
 * 启动网络状态轮询
 */
export function startNetworkPolling(
  networkDetector: NetworkDetector,
  logger: ReturnType<typeof createLogger>,
  intervalMs: number = 30000
) {
  networkDetector.startPolling(
    (status) => {
      // 广播给所有窗口
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(IPC_EVENTS.NETWORK_STATUS_CHANGED, status);
      });
    },
    { interval: intervalMs, immediate: true }
  );

  logger.info(`网络状态轮询已启动 (间隔: ${intervalMs / 1000}s)`);
}

/**
 * 停止网络状态轮询
 */
export function stopNetworkPolling(
  networkDetector: NetworkDetector,
  logger: ReturnType<typeof createLogger>
) {
  networkDetector.stopPolling();
  logger.info('网络状态轮询已停止');
}
