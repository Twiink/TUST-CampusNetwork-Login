/**
 * 配置相关 IPC 处理
 */

import { ipcMain } from 'electron';
import { ConfigManager, AppConfig, AppSettings, createLogger } from '@repo/shared';
import { IPC_CHANNELS } from './channels';

/**
 * 注册配置 IPC 处理器
 */
export function registerConfigIPC(
  configManager: ConfigManager,
  logger: ReturnType<typeof createLogger>
) {
  /**
   * 获取配置
   */
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async (): Promise<AppConfig | null> => {
    try {
      return configManager.getConfig();
    } catch (error) {
      logger.error('获取配置失败', error);
      return null;
    }
  });

  /**
   * 保存配置
   */
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_, config: AppConfig): Promise<boolean> => {
    try {
      await configManager.save(config);
      logger.info('配置已保存');
      return true;
    } catch (error) {
      logger.error('保存配置失败', error);
      return false;
    }
  });

  /**
   * 重置配置
   */
  ipcMain.handle(IPC_CHANNELS.CONFIG_RESET, async (): Promise<AppConfig> => {
    try {
      const config = await configManager.reset();
      logger.info('配置已重置');
      return config;
    } catch (error) {
      logger.error('重置配置失败', error);
      throw error;
    }
  });

  /**
   * 获取设置
   */
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (): Promise<AppSettings> => {
    return configManager.getSettings();
  });

  /**
   * 更新设置
   */
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_, settings: Partial<AppSettings>): Promise<AppSettings> => {
    try {
      const updated = await configManager.updateSettings(settings);
      logger.info('设置已更新');
      return updated;
    } catch (error) {
      logger.error('更新设置失败', error);
      throw error;
    }
  });
}
