/**
 * WiFi 相关 IPC 处理
 */

import { ipcMain } from 'electron';
import { WifiManager, WifiConfig, createLogger } from '@repo/shared';
import { IPC_CHANNELS } from './channels';

/**
 * 注册 WiFi IPC 处理器
 */
export function registerWifiIPC(wifiManager: WifiManager, logger: ReturnType<typeof createLogger>) {
  /**
   * 获取 WiFi 列表
   */
  ipcMain.handle(IPC_CHANNELS.WIFI_LIST, async (): Promise<WifiConfig[]> => {
    return wifiManager.getWifiConfigs();
  });

  /**
   * 添加 WiFi
   */
  ipcMain.handle(
    IPC_CHANNELS.WIFI_ADD,
    async (_, wifi: Omit<WifiConfig, 'id'>): Promise<WifiConfig> => {
      try {
        const newWifi = await wifiManager.addWifi(wifi);
        logger.info(`WiFi 已添加: ${newWifi.ssid}`);
        return newWifi;
      } catch (error) {
        logger.error('添加 WiFi 失败', error);
        throw error;
      }
    }
  );

  /**
   * 更新 WiFi
   */
  ipcMain.handle(
    IPC_CHANNELS.WIFI_UPDATE,
    async (_, id: string, updates: Partial<WifiConfig>): Promise<WifiConfig> => {
      try {
        const updated = await wifiManager.updateWifi(id, updates);
        logger.info(`WiFi 已更新: ${updated.ssid}`);
        return updated;
      } catch (error) {
        logger.error('更新 WiFi 失败', error);
        throw error;
      }
    }
  );

  /**
   * 删除 WiFi
   */
  ipcMain.handle(IPC_CHANNELS.WIFI_REMOVE, async (_, id: string): Promise<void> => {
    try {
      await wifiManager.removeWifi(id);
      logger.info('WiFi 已删除');
    } catch (error) {
      logger.error('删除 WiFi 失败', error);
      throw error;
    }
  });
}
