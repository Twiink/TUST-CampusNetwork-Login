/**
 * WiFi 配置管理服务
 */

import { WifiConfig } from '../types/config';
import { validateWifiConfig, createDefaultWifiConfig, generateId } from '../utils/validator';
import { ErrorCode, AppError } from '../constants/errors';
import { ConfigManager } from './ConfigManager';

/**
 * WiFi 配置管理服务类
 */
export class WifiManager {
  constructor(private configManager: ConfigManager) {}

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
    return wifiList.find(w => w.id === id) || null;
  }

  /**
   * 根据 SSID 获取 WiFi 配置
   */
  getWifiBySsid(ssid: string): WifiConfig | null {
    const wifiList = this.getWifiConfigs();
    return wifiList.find(w => w.ssid === ssid) || null;
  }

  /**
   * 添加 WiFi 配置
   */
  async addWifi(wifi: Omit<WifiConfig, 'id'> & { id?: string }): Promise<WifiConfig> {
    const newWifi: WifiConfig = {
      ...createDefaultWifiConfig(),
      ...wifi,
      id: wifi.id || generateId(),
    };

    const validation = validateWifiConfig(newWifi);
    if (!validation.valid) {
      throw new AppError(ErrorCode.INVALID_PARAMS, validation.errors.join('; '));
    }

    const config = this.configManager.getConfig();
    if (!config) {
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '配置未加载');
    }

    // 检查是否已存在相同 SSID 的配置
    const exists = config.wifiList.find(w => w.ssid === newWifi.ssid);
    if (exists) {
      throw new AppError(ErrorCode.INVALID_PARAMS, '该 WiFi 已存在');
    }

    const updatedWifiList = [...config.wifiList, newWifi];

    await this.configManager.update({ wifiList: updatedWifiList });

    return newWifi;
  }

  /**
   * 更新 WiFi 配置
   */
  async updateWifi(id: string, updates: Partial<Omit<WifiConfig, 'id'>>): Promise<WifiConfig> {
    const config = this.configManager.getConfig();
    if (!config) {
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '配置未加载');
    }

    const index = config.wifiList.findIndex(w => w.id === id);
    if (index === -1) {
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, 'WiFi 配置不存在');
    }

    const updatedWifi: WifiConfig = {
      ...config.wifiList[index],
      ...updates,
      id, // 确保 ID 不变
    };

    const validation = validateWifiConfig(updatedWifi);
    if (!validation.valid) {
      throw new AppError(ErrorCode.INVALID_PARAMS, validation.errors.join('; '));
    }

    const updatedWifiList = [...config.wifiList];
    updatedWifiList[index] = updatedWifi;

    await this.configManager.update({ wifiList: updatedWifiList });

    return updatedWifi;
  }

  /**
   * 删除 WiFi 配置
   */
  async removeWifi(id: string): Promise<void> {
    const config = this.configManager.getConfig();
    if (!config) {
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '配置未加载');
    }

    const updatedWifiList = config.wifiList.filter(w => w.id !== id);

    if (updatedWifiList.length === config.wifiList.length) {
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, 'WiFi 配置不存在');
    }

    await this.configManager.update({ wifiList: updatedWifiList });
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
    return this.getWifiConfigs().filter(w => w.autoConnect);
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
export function createWifiManager(configManager: ConfigManager): WifiManager {
  return new WifiManager(configManager);
}
