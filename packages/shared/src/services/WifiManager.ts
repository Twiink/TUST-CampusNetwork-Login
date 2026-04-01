/**
 * WiFi 配置管理服务
 */

import { WifiConfig } from '../types/config';
import { validateWifiConfig, createDefaultWifiConfig, generateId } from '../utils/validator';
import { ErrorCode, AppError } from '../constants/errors';
import { ConfigManager } from './ConfigManager';
import type { Logger } from '../models/Logger';

export interface WifiMatchInput {
  ssid: string;
  security?: string;
  bssid?: string;
}

function sameFingerprint(left: WifiConfig, right: WifiMatchInput): boolean {
  return (
    left.ssid === right.ssid &&
    (left.security || '') === (right.security || '') &&
    (left.bssid || '') === (right.bssid || '')
  );
}

function compareWifiPriority(left: WifiConfig, right: WifiConfig): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  const leftConnectedAt = left.lastConnectedAt ?? 0;
  const rightConnectedAt = right.lastConnectedAt ?? 0;

  return rightConnectedAt - leftConnectedAt;
}

/**
 * WiFi 配置管理服务类
 */
export class WifiManager {
  private logger: Logger | null;

  constructor(
    private configManager: ConfigManager,
    logger?: Logger
  ) {
    this.logger = logger || null;
  }

  /**
   * 获取所有 WiFi 配置
   */
  getWifiConfigs(): WifiConfig[] {
    const config = this.configManager.getConfig();
    return [...(config?.wifiList || [])].sort(compareWifiPriority);
  }

  /**
   * 根据 ID 获取 WiFi 配置
   */
  getWifiById(id: string): WifiConfig | null {
    const wifiList = this.getWifiConfigs();
    return wifiList.find((wifi) => wifi.id === id) || null;
  }

  /**
   * 根据 SSID 获取优先级最高的 WiFi 配置
   */
  getWifiBySsid(ssid: string): WifiConfig | null {
    const wifiList = this.getWifiConfigs();
    return wifiList.find((wifi) => wifi.ssid === ssid) || null;
  }

  /**
   * 根据 SSID 获取所有匹配的 WiFi 配置
   */
  getWifiBySsidList(ssid: string): WifiConfig[] {
    return this.getWifiConfigs().filter((wifi) => wifi.ssid === ssid);
  }

  /**
   * 根据当前 WiFi 信息进行精确匹配
   */
  findMatchingWifi(input: WifiMatchInput): WifiConfig | null {
    const candidates = this.getWifiBySsidList(input.ssid);
    if (candidates.length === 0) {
      return null;
    }

    const exactMatch = candidates.find((wifi) => sameFingerprint(wifi, input));
    if (exactMatch) {
      return exactMatch;
    }

    if (input.security) {
      const securityMatch = candidates.find(
        (wifi) => (wifi.security || '') === input.security && !wifi.bssid
      );
      if (securityMatch) {
        return securityMatch;
      }
    }

    return candidates[0] || null;
  }

  private assertConfigLoaded() {
    const config = this.configManager.getConfig();
    if (!config) {
      this.logger?.error('WiFi配置操作失败：配置未加载');
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '配置未加载');
    }

    return config;
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
      linkedAccountIds: [...wifi.linkedAccountIds],
      id: wifi.id || generateId(),
    };

    const validation = validateWifiConfig(newWifi);
    if (!validation.valid) {
      this.logger?.error('添加WiFi配置失败：验证失败', {
        错误: validation.errors.join('; '),
      });
      throw new AppError(ErrorCode.INVALID_PARAMS, validation.errors.join('; '));
    }

    const config = this.assertConfigLoaded();
    const exists = config.wifiList.find((item) => sameFingerprint(item, newWifi));
    if (exists) {
      this.logger?.error('添加WiFi配置失败：该WiFi已存在', {
        SSID: newWifi.ssid,
        安全类型: newWifi.security || '未知',
        BSSID: newWifi.bssid || '无',
      });
      throw new AppError(ErrorCode.INVALID_PARAMS, '该 WiFi 配置已存在');
    }

    const updatedWifiList = [...config.wifiList, newWifi].sort(compareWifiPriority);
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

    const config = this.assertConfigLoaded();
    const index = config.wifiList.findIndex((wifi) => wifi.id === id);
    if (index === -1) {
      this.logger?.error('更新WiFi配置失败：配置不存在', { WiFi_ID: id });
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, 'WiFi 配置不存在');
    }

    const updatedWifi: WifiConfig = {
      ...config.wifiList[index],
      ...updates,
      linkedAccountIds: updates.linkedAccountIds
        ? [...updates.linkedAccountIds]
        : config.wifiList[index].linkedAccountIds,
      id,
    };

    const validation = validateWifiConfig(updatedWifi);
    if (!validation.valid) {
      this.logger?.error('更新WiFi配置失败：验证失败', {
        WiFi_ID: id,
        错误: validation.errors.join('; '),
      });
      throw new AppError(ErrorCode.INVALID_PARAMS, validation.errors.join('; '));
    }

    const duplicate = config.wifiList.find(
      (wifi) => wifi.id !== id && sameFingerprint(wifi, updatedWifi)
    );
    if (duplicate) {
      throw new AppError(ErrorCode.INVALID_PARAMS, '存在相同指纹的 WiFi 配置');
    }

    const updatedWifiList = [...config.wifiList];
    updatedWifiList[index] = updatedWifi;
    updatedWifiList.sort(compareWifiPriority);

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

    const config = this.assertConfigLoaded();
    const wifiToRemove = config.wifiList.find((wifi) => wifi.id === id);
    const updatedWifiList = config.wifiList.filter((wifi) => wifi.id !== id);

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
  matchWifi(target: string | WifiMatchInput): WifiConfig | null {
    if (typeof target === 'string') {
      return this.getWifiBySsid(target);
    }

    return this.findMatchingWifi(target);
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
    return this.getWifiConfigs().filter((wifi) => wifi.autoConnect);
  }

  /**
   * 获取重连候选列表，可指定本次会话首选 SSID
   */
  getReconnectCandidates(preferredSsid?: string): WifiConfig[] {
    const wifiList = this.getAutoConnectWifiList();
    if (!preferredSsid) {
      return wifiList;
    }

    return [...wifiList].sort((left, right) => {
      if (left.ssid === preferredSsid && right.ssid !== preferredSsid) {
        return -1;
      }

      if (right.ssid === preferredSsid && left.ssid !== preferredSsid) {
        return 1;
      }

      return compareWifiPriority(left, right);
    });
  }

  /**
   * 标记 WiFi 连接成功，更新最近连接时间
   */
  async markConnected(id: string, connectedAt: number = Date.now()): Promise<WifiConfig> {
    return this.updateWifi(id, { lastConnectedAt: connectedAt });
  }

  /**
   * 根据 WiFi 信息标记连接成功
   */
  async markConnectedByMatch(
    input: WifiMatchInput,
    connectedAt: number = Date.now()
  ): Promise<WifiConfig | null> {
    const matched = this.findMatchingWifi(input);
    if (!matched) {
      return null;
    }

    return this.markConnected(matched.id, connectedAt);
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
