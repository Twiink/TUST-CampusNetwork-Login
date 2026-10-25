/**
 * 默认配置工厂与 ID 生成(自 validator.ts 抽出)。
 */

import type { AccountConfig, AppConfig, WifiConfig } from '../types/config';
type LegacyWifiConfig = Partial<WifiConfig> & {
  linkedAccountId?: string;
};
import { DEFAULT_SERVER_URL } from '../constants/defaults';
import { normalizeAppSettings, normalizeWifiConfig } from './validator';

let idCounter = 0;
let lastTimestamp = 0;

/**
 * 创建默认账户配置
 */
export function createDefaultAccountConfig(partial: Partial<AccountConfig> = {}): AccountConfig {
  return {
    id: partial.id || generateId(),
    name: partial.name || '默认账户',
    username: partial.username || '',
    password: partial.password || '',
    serverUrl: partial.serverUrl || DEFAULT_SERVER_URL,
    isp: partial.isp || 'campus',
  };
}

/**
 * 创建默认 WiFi 配置
 */
export function createDefaultWifiConfig(partial: Partial<LegacyWifiConfig> = {}): WifiConfig {
  return normalizeWifiConfig(partial);
}

/**
 * 创建默认应用配置
 */
export function createDefaultAppConfig(partial: Partial<AppConfig> = {}): AppConfig {
  return {
    accounts: partial.accounts || [],
    currentAccountId: partial.currentAccountId ?? null,
    wifiList: (partial.wifiList || []).map((wifi) => normalizeWifiConfig(wifi)),
    settings: normalizeAppSettings(partial.settings),
  };
}

/**
 * 生成唯一 ID
 * 使用高精度时间戳 + 递增计数器 + 随机数确保唯一性
 */
export function generateId(): string {
  const now = Date.now();

  if (now === lastTimestamp) {
    idCounter++;
  } else {
    idCounter = 0;
    lastTimestamp = now;
  }

  const globalPerformance = (globalThis as { performance?: { now?: () => number } }).performance;
  const perfNow = typeof globalPerformance?.now === 'function' ? globalPerformance.now() : 0;
  const microPart = Math.floor((perfNow % 1) * 1000000).toString(36);

  return `${now.toString(36)}-${idCounter.toString(36)}-${microPart}-${Math.random().toString(36).substring(2, 7)}`;
}
