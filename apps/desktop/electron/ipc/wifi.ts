/**
 * WiFi 相关 IPC 处理
 */

import { ipcMain } from 'electron';
import { WifiManager, WifiConfig, createLogger } from '@repo/shared';
import { IPC_CHANNELS } from './channels';
import { WifiSwitcherService, scanAvailableNetworks, AvailableNetwork } from '../services/wifi-switcher';

/**
 * 注册 WiFi IPC 处理器
 */
export function registerWifiIPC(
  wifiManager: WifiManager,
  logger: ReturnType<typeof createLogger>,
  wifiSwitcherService?: WifiSwitcherService
) {
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

        // 更新 WiFi 切换服务的配置列表
        if (wifiSwitcherService) {
          const wifiConfigs = wifiManager.getWifiConfigs();
          wifiSwitcherService.setConfiguredNetworks(
            wifiConfigs.map((w) => ({
              ssid: w.ssid,
              password: w.password,
              priority: w.priority || 10,
            }))
          );
        }

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

        // 更新 WiFi 切换服务的配置列表
        if (wifiSwitcherService) {
          const wifiConfigs = wifiManager.getWifiConfigs();
          wifiSwitcherService.setConfiguredNetworks(
            wifiConfigs.map((w) => ({
              ssid: w.ssid,
              password: w.password,
              priority: w.priority || 10,
            }))
          );
        }

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

      // 更新 WiFi 切换服务的配置列表
      if (wifiSwitcherService) {
        const wifiConfigs = wifiManager.getWifiConfigs();
        wifiSwitcherService.setConfiguredNetworks(
          wifiConfigs.map((w) => ({
            ssid: w.ssid,
            password: w.password,
            priority: w.priority || 10,
          }))
        );
      }
    } catch (error) {
      logger.error('删除 WiFi 失败', error);
      throw error;
    }
  });

  /**
   * 切换到指定 WiFi
   */
  ipcMain.handle(IPC_CHANNELS.WIFI_SWITCH, async (_, ssid: string): Promise<boolean> => {
    logger.info(`IPC请求：切换WiFi`, { 目标SSID: ssid });

    if (!wifiSwitcherService) {
      logger.error('WiFi切换失败：WiFi切换服务未初始化');
      throw new Error('WiFi切换服务未初始化');
    }

    try {
      const success = await wifiSwitcherService.connectToConfiguredNetwork(ssid);
      if (success) {
        logger.success(`WiFi切换成功`, { SSID: ssid });
      } else {
        logger.error(`WiFi切换失败`, { SSID: ssid });
      }
      return success;
    } catch (error) {
      logger.error('WiFi切换异常', {
        SSID: ssid,
        错误: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  /**
   * 扫描可用的 WiFi 网络
   */
  ipcMain.handle(IPC_CHANNELS.WIFI_SCAN, async (): Promise<AvailableNetwork[]> => {
    logger.info('IPC请求：扫描WiFi网络');

    try {
      const networks = await scanAvailableNetworks();
      logger.success(`WiFi扫描完成`, { 发现网络数: networks.length });
      return networks;
    } catch (error) {
      logger.error('WiFi扫描失败', {
        错误: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
}
