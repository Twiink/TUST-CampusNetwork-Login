/**
 * WiFi 配置管理服务
 */

import { WifiConfig } from '../types/config';
import { validateWifiConfig, createDefaultWifiConfig, generateId } from '../utils/validator';
import { ErrorCode, AppError } from '../constants/errors';
import { ConfigManager } from './ConfigManager';
import type { Logger } from '../models/Logger';

/**
 * WiFi 配置管理服务类
 */
export class WifiManager {
  private logger: Logger | null;

  constructor(private configManager: ConfigManager, logger?: Logger) {
    this.logger = logger || null;
  }

  /**
   * 获取所有 WiFi 配置
   */
  getWifiConfigs(): WifiConfig[] {
    const config = this.configManager.getConfig();
    return config?.wifiList || [];
  }

  /**
   * 根据 ID 获取 WiFi 配置
   */
  getWifiById(id: string): WifiConfig | null {
    const wifiList = this.getWifiConfigs();
    return wifiList.find((w) => w.id === id) || null;
  }

  /**
   * 根据 SSID 获取 WiFi 配置
   */
  getWifiBySsid(ssid: string): WifiConfig | null {
    const wifiList = this.getWifiConfigs();
    return wifiList.find((w) => w.ssid === ssid) || null;
  }

  /**
   * 添加 WiFi 配置
   */
  async addWifi(wifi: Omit<WifiConfig, 'id'> & { id?: string }): Promise<WifiConfig> {
    this.logger?.info('添加WiFi配置', {
      SSID: wifi.ssid,
      优先级: wifi.priority,
      自动连接: wifi.autoConnect ? '是' : '否',
    });

    const newWifi: WifiConfig = {
      ...createDefaultWifiConfig(),
      ...wifi,
      id: wifi.id || generateId(),
    };

    const validation = validateWifiConfig(newWifi);
    if (!validation.valid) {
      this.logger?.error('添加WiFi配置失败：验证失败', {
        错误: validation.errors.join('; '),
      });
      throw new AppError(ErrorCode.INVALID_PARAMS, validation.errors.join('; '));
    }

    const config = this.configManager.getConfig();
    if (!config) {
      this.logger?.error('添加WiFi配置失败：配置未加载');
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '配置未加载');
    }

    // 检查是否已存在相同 SSID 的配置
    const exists = config.wifiList.find((w) => w.ssid === newWifi.ssid);
    if (exists) {
      this.logger?.error('添加WiFi配置失败：该WiFi已存在', {
        SSID: newWifi.ssid,
      });
      throw new AppError(ErrorCode.INVALID_PARAMS, '该 WiFi 已存在');
    }

    const updatedWifiList = [...config.wifiList, newWifi];

    await this.configManager.update({ wifiList: updatedWifiList });

    this.logger?.success('WiFi配置添加成功', {
      WiFi_ID: newWifi.id,
      SSID: newWifi.ssid,
      WiFi总数: updatedWifiList.length,
    });

    return newWifi;
  }

  /**
   * 更新 WiFi 配置
   */
  async updateWifi(id: string, updates: Partial<Omit<WifiConfig, 'id'>>): Promise<WifiConfig> {
    this.logger?.info('更新WiFi配置', {
      WiFi_ID: id,
      更新字段: Object.keys(updates).join(', '),
    });

    const config = this.configManager.getConfig();
    if (!config) {
      this.logger?.error('更新WiFi配置失败：配置未加载');
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '配置未加载');
    }

    const index = config.wifiList.findIndex((w) => w.id === id);
    if (index === -1) {
      this.logger?.error('更新WiFi配置失败：配置不存在', { WiFi_ID: id });
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, 'WiFi 配置不存在');
    }

    const updatedWifi: WifiConfig = {
      ...config.wifiList[index],
      ...updates,
      id, // 确保 ID 不变
    };

    const validation = validateWifiConfig(updatedWifi);
    if (!validation.valid) {
      this.logger?.error('更新WiFi配置失败：验证失败', {
        WiFi_ID: id,
        错误: validation.errors.join('; '),
      });
      throw new AppError(ErrorCode.INVALID_PARAMS, validation.errors.join('; '));
    }

    const updatedWifiList = [...config.wifiList];
    updatedWifiList[index] = updatedWifi;

    await this.configManager.update({ wifiList: updatedWifiList });

    this.logger?.success('WiFi配置更新成功', {
      WiFi_ID: id,
      SSID: updatedWifi.ssid,
    });

    return updatedWifi;
  }

  /**
   * 删除 WiFi 配置
   */
  async removeWifi(id: string): Promise<void> {
    this.logger?.info('删除WiFi配置', { WiFi_ID: id });

    const config = this.configManager.getConfig();
    if (!config) {
      this.logger?.error('删除WiFi配置失败：配置未加载');
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '配置未加载');
    }

    const wifiToRemove = config.wifiList.find((w) => w.id === id);
    const updatedWifiList = config.wifiList.filter((w) => w.id !== id);

    if (updatedWifiList.length === config.wifiList.length) {
      this.logger?.error('删除WiFi配置失败：配置不存在', { WiFi_ID: id });
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, 'WiFi 配置不存在');
    }

    await this.configManager.update({ wifiList: updatedWifiList });

    this.logger?.success('WiFi配置删除成功', {
      WiFi_ID: id,
      SSID: wifiToRemove?.ssid || '未知',
      剩余WiFi数: updatedWifiList.length,
    });
  }

  /**
   * 匹配当前 WiFi 是否在配置列表中
   */
  matchWifi(ssid: string): WifiConfig | null {
    return this.getWifiBySsid(ssid);
  }

  /**
   * 检查 SSID 是否需要自动连接
   */
  shouldAutoConnect(ssid: string): boolean {
    const wifi = this.getWifiBySsid(ssid);
    return wifi?.autoConnect ?? false;
  }

  /**
   * 获取所有自动连接的 WiFi
   */
  getAutoConnectWifiList(): WifiConfig[] {
    return this.getWifiConfigs().filter((w) => w.autoConnect);
  }

  /**
   * 获取 WiFi 配置数量
   */
  getWifiCount(): number {
    return this.getWifiConfigs().length;
  }

  /**
   * 检查是否有 WiFi 配置
   */
  hasWifiConfigs(): boolean {
    return this.getWifiCount() > 0;
  }
}

/**
 * 创建 WiFi 配置管理服务实例
 */
export function createWifiManager(configManager: ConfigManager, logger?: Logger): WifiManager {
  return new WifiManager(configManager, logger);
}
