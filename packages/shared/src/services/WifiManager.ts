/**
 * WiFi 配置管理服务
 */

import { WifiConfig } from '../types/config';
import { validateWifiConfig, createDefaultWifiConfig, generateId } from '../utils/validator';
import { isCampusNetwork } from '../utils/campus';
import { ErrorCode, AppError } from '../constants/errors';
import { ConfigManager } from './ConfigManager';
import type { Logger } from '../models/Logger';
import { matchWifiRule, sameWifiFingerprint } from './wifi-identity';

/** 认证需求解析结果：驱动自动重连的守卫字段 */
export interface AuthRequirement {
  /** 当前 WiFi 是否需要校园网认证 */
  requiresAuth: boolean;
  /** 是否在 WiFi 配置列表中（未配置时走校园网启发式） */
  isConfigured: boolean;
  /** 配置的 WiFi 是否关联了认证账号 */
  hasLinkedAccount: boolean;
}

export interface WifiMatchInput {
  ssid: string;
  security?: string;
  bssid?: string;
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
  private sortedCache: WifiConfig[] | null = null;
  private cacheSource: WifiConfig[] | null = null;

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
    if (!config) {
      return [];
    }
    if (this.sortedCache && this.cacheSource === config.wifiList) {
      return this.sortedCache;
    }
    this.sortedCache = [...config.wifiList].sort(compareWifiPriority);
    this.cacheSource = config.wifiList;
    return this.sortedCache;
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
    return matchWifiRule(this.getWifiConfigs(), input);
  }

  async addWifi(wifi: Omit<WifiConfig, 'id'> & { id?: string }): Promise<WifiConfig> {
    const next: WifiConfig = {
      ...createDefaultWifiConfig(),
      ...wifi,
      linkedAccountIds: [...wifi.linkedAccountIds],
      id: wifi.id || generateId(),
    };
    const config = await this.configManager.update((current) => {
      this.checkWifi(next);
      if (current.wifiList.some((w) => sameWifiFingerprint(w, next) || w.id === next.id))
        throw new AppError(ErrorCode.INVALID_PARAMS, '该 WiFi 配置已存在');
      return { wifiList: [...current.wifiList, next].sort(compareWifiPriority) };
    });
    this.logger?.success('WiFi配置添加成功', { SSID: next.ssid });
    return config.wifiList.find((w) => w.id === next.id)!;
  }

  private checkWifi(wifi: WifiConfig): void {
    const result = validateWifiConfig(wifi);
    if (!result.valid) throw new AppError(ErrorCode.INVALID_PARAMS, result.errors.join('; '));
  }

  async updateWifi(id: string, updates: Partial<Omit<WifiConfig, 'id'>>): Promise<WifiConfig> {
    const config = await this.configManager.update((current) => {
      const previous = current.wifiList.find((w) => w.id === id);
      if (!previous) throw new AppError(ErrorCode.CONFIG_NOT_FOUND, 'WiFi 配置不存在');
      const next = {
        ...previous,
        ...updates,
        linkedAccountIds: [...(updates.linkedAccountIds ?? previous.linkedAccountIds)],
        id,
      };
      this.checkWifi(next);
      if (current.wifiList.some((w) => w.id !== id && sameWifiFingerprint(w, next)))
        throw new AppError(ErrorCode.INVALID_PARAMS, '存在相同指纹的 WiFi 配置');
      return {
        wifiList: current.wifiList.map((w) => (w.id === id ? next : w)).sort(compareWifiPriority),
      };
    });
    return config.wifiList.find((w) => w.id === id)!;
  }

  async removeWifi(id: string): Promise<void> {
    await this.configManager.update((current) => {
      if (!current.wifiList.some((w) => w.id === id))
        throw new AppError(ErrorCode.CONFIG_NOT_FOUND, 'WiFi 配置不存在');
      return { wifiList: current.wifiList.filter((w) => w.id !== id) };
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
   * 解析当前 WiFi 的认证需求（三级判定）
   * 1. WiFi 在配置列表 → 用户显式配置的 requiresAuth（优先）
   * 2. 未配置 → 校园网启发式（SSID 前缀 TUST/CU_TUST 且 IP 为 10.x，对齐参考实现，
   *    使未配置的校园 WiFi 开箱即用）
   * 3. 否则 → 无需认证（家庭 WiFi/热点不误触发）
   */
  resolveAuthRequirement(
    ssid: string | null | undefined,
    ipv4?: string | null,
    identity?: Omit<WifiMatchInput, 'ssid'>
  ): AuthRequirement {
    if (!ssid) {
      return { requiresAuth: false, isConfigured: false, hasLinkedAccount: false };
    }

    const wifi = this.findMatchingWifi({ ssid, ...identity });
    if (wifi) {
      return {
        requiresAuth: wifi.requiresAuth,
        isConfigured: true,
        hasLinkedAccount: wifi.linkedAccountIds.length > 0,
      };
    }

    if (this.getWifiBySsidList(ssid).length)
      return { requiresAuth: false, isConfigured: true, hasLinkedAccount: false };
    return {
      requiresAuth: isCampusNetwork(ssid, ipv4),
      isConfigured: false,
      hasLinkedAccount: false,
    };
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
