/**
 * 数据验证与配置归一化工具
 */

import {
  AccountConfig,
  WifiConfig,
  AppSettings,
  AppConfig,
  ISP,
  NotificationSettings,
} from '../types/config';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_SERVER_URL,
} from '../constants/defaults';

type LegacyWifiConfig = Partial<WifiConfig> & {
  linkedAccountId?: string;
};

type LegacyAppSettings = Partial<AppSettings> & {
  pollingInterval?: number;
  maxRetries?: number;
  showNotification?: boolean;
};

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function dedupeStringList(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

/**
 * 归一化通知设置
 */
export function normalizeNotificationSettings(input?: unknown): NotificationSettings {
  if (!isRecord(input)) {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }

  return {
    wifiDisconnected:
      typeof input.wifiDisconnected === 'boolean'
        ? input.wifiDisconnected
        : DEFAULT_NOTIFICATION_SETTINGS.wifiDisconnected,
    reconnectSuccess:
      typeof input.reconnectSuccess === 'boolean'
        ? input.reconnectSuccess
        : DEFAULT_NOTIFICATION_SETTINGS.reconnectSuccess,
    reconnectFailed:
      typeof input.reconnectFailed === 'boolean'
        ? input.reconnectFailed
        : DEFAULT_NOTIFICATION_SETTINGS.reconnectFailed,
    authRecovered:
      typeof input.authRecovered === 'boolean'
        ? input.authRecovered
        : DEFAULT_NOTIFICATION_SETTINGS.authRecovered,
  };
}

/**
 * 归一化应用设置，兼容旧字段
 */
export function normalizeAppSettings(settings?: unknown): AppSettings {
  const raw = (isRecord(settings) ? settings : {}) as LegacyAppSettings;
  const legacyShowNotification =
    typeof raw.showNotification === 'boolean' ? raw.showNotification : undefined;
  const notificationSettings = normalizeNotificationSettings(raw.notificationSettings);

  return {
    autoLaunch:
      typeof raw.autoLaunch === 'boolean' ? raw.autoLaunch : DEFAULT_APP_SETTINGS.autoLaunch,
    enableHeartbeat:
      typeof raw.enableHeartbeat === 'boolean'
        ? raw.enableHeartbeat
        : DEFAULT_APP_SETTINGS.enableHeartbeat,
    heartbeatIntervalSeconds:
      toFiniteNumber(raw.heartbeatIntervalSeconds) ??
      toFiniteNumber(raw.pollingInterval) ??
      DEFAULT_APP_SETTINGS.heartbeatIntervalSeconds,
    pollingInterval:
      toFiniteNumber(raw.heartbeatIntervalSeconds) ??
      toFiniteNumber(raw.pollingInterval) ??
      DEFAULT_APP_SETTINGS.heartbeatIntervalSeconds,
    heartbeatFailureThreshold:
      toFiniteNumber(raw.heartbeatFailureThreshold) ??
      DEFAULT_APP_SETTINGS.heartbeatFailureThreshold,
    autoReconnect:
      typeof raw.autoReconnect === 'boolean'
        ? raw.autoReconnect
        : DEFAULT_APP_SETTINGS.autoReconnect,
    wifiReconnectRetries:
      toFiniteNumber(raw.wifiReconnectRetries) ??
      toFiniteNumber(raw.maxRetries) ??
      DEFAULT_APP_SETTINGS.wifiReconnectRetries,
    maxRetries:
      toFiniteNumber(raw.wifiReconnectRetries) ??
      toFiniteNumber(raw.maxRetries) ??
      DEFAULT_APP_SETTINGS.wifiReconnectRetries,
    wifiReconnectCooldownMinutes:
      toFiniteNumber(raw.wifiReconnectCooldownMinutes) ??
      DEFAULT_APP_SETTINGS.wifiReconnectCooldownMinutes,
    startupAutoConnect:
      typeof raw.startupAutoConnect === 'boolean'
        ? raw.startupAutoConnect
        : DEFAULT_APP_SETTINGS.startupAutoConnect,
    keepCurrentConnection:
      typeof raw.keepCurrentConnection === 'boolean'
        ? raw.keepCurrentConnection
        : DEFAULT_APP_SETTINGS.keepCurrentConnection,
    notificationSettings:
      legacyShowNotification === undefined
        ? notificationSettings
        : {
            wifiDisconnected: legacyShowNotification,
            reconnectSuccess: legacyShowNotification,
            reconnectFailed: legacyShowNotification,
            authRecovered: legacyShowNotification,
          },
    showNotification:
      legacyShowNotification ?? Object.values(notificationSettings).some((value) => value),
    autoUpdate:
      typeof raw.autoUpdate === 'boolean' ? raw.autoUpdate : DEFAULT_APP_SETTINGS.autoUpdate,
  };
}

/**
 * 验证账户配置
 */
export function validateAccountConfig(config: Partial<AccountConfig>): ValidationResult {
  const errors: string[] = [];

  if (!config.id || typeof config.id !== 'string') {
    errors.push('账户 ID 不能为空');
  }

  if (!config.username || typeof config.username !== 'string') {
    errors.push('用户名不能为空');
  }

  if (!config.password || typeof config.password !== 'string') {
    errors.push('密码不能为空');
  }

  if (config.serverUrl && typeof config.serverUrl !== 'string') {
    errors.push('服务器地址格式无效');
  }

  if (config.serverUrl) {
    try {
      new URL(config.serverUrl);
    } catch {
      errors.push('服务器地址格式无效');
    }
  }

  const validIsps: ISP[] = ['campus', 'cmcc', 'cucc', 'ctcc'];
  if (config.isp && !validIsps.includes(config.isp)) {
    errors.push('无效的服务商类型');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 归一化 WiFi 配置，兼容旧字段
 */
export function normalizeWifiConfig(config: Partial<LegacyWifiConfig> = {}): WifiConfig {
  const linkedAccountIds = Array.isArray(config.linkedAccountIds)
    ? dedupeStringList(config.linkedAccountIds)
    : dedupeStringList(config.linkedAccountId ? [config.linkedAccountId] : []);
  const requiresAuth = config.requiresAuth ?? true;

  return {
    id: toNonEmptyString(config.id) || generateId(),
    ssid: toNonEmptyString(config.ssid) || '',
    password: typeof config.password === 'string' ? config.password : '',
    autoConnect: config.autoConnect ?? true,
    requiresAuth,
    security: toNonEmptyString(config.security),
    bssid: toNonEmptyString(config.bssid),
    linkedAccountIds: requiresAuth ? linkedAccountIds : [],
    linkedAccountId: requiresAuth ? linkedAccountIds[0] : undefined,
    priority: toFiniteNumber(config.priority) ?? 10,
    lastConnectedAt:
      config.lastConnectedAt === null ? null : (toFiniteNumber(config.lastConnectedAt) ?? null),
  };
}

/**
 * 验证 WiFi 配置
 */
export function validateWifiConfig(config: Partial<WifiConfig>): ValidationResult {
  const errors: string[] = [];

  if (!config.id || typeof config.id !== 'string') {
    errors.push('WiFi 配置 ID 不能为空');
  }

  if (!config.ssid || typeof config.ssid !== 'string') {
    errors.push('WiFi 名称不能为空');
  }

  if (config.password !== undefined && typeof config.password !== 'string') {
    errors.push('WiFi 密码格式无效');
  }

  if (config.autoConnect !== undefined && typeof config.autoConnect !== 'boolean') {
    errors.push('自动连接设置格式无效');
  }

  if (config.requiresAuth !== undefined && typeof config.requiresAuth !== 'boolean') {
    errors.push('认证需求设置格式无效');
  }

  if (config.security !== undefined && typeof config.security !== 'string') {
    errors.push('安全类型格式无效');
  }

  if (config.bssid !== undefined && typeof config.bssid !== 'string') {
    errors.push('BSSID 格式无效');
  }

  if (!Array.isArray(config.linkedAccountIds)) {
    errors.push('关联账号列表格式无效');
  }

  if (
    Array.isArray(config.linkedAccountIds) &&
    config.linkedAccountIds.some((item) => typeof item !== 'string')
  ) {
    errors.push('关联账号列表存在无效项');
  }

  if (
    typeof config.priority !== 'number' ||
    !Number.isFinite(config.priority) ||
    config.priority < 0
  ) {
    errors.push('优先级必须是大于等于 0 的数字');
  }

  if (
    config.lastConnectedAt !== undefined &&
    config.lastConnectedAt !== null &&
    (typeof config.lastConnectedAt !== 'number' || !Number.isFinite(config.lastConnectedAt))
  ) {
    errors.push('最近连接时间格式无效');
  }

  if (config.requiresAuth && (!config.linkedAccountIds || config.linkedAccountIds.length === 0)) {
    errors.push('需要认证的 WiFi 必须至少关联一个账号');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证应用设置
 */
export function validateAppSettings(settings: Partial<AppSettings>): ValidationResult {
  const errors: string[] = [];

  if (settings.heartbeatIntervalSeconds !== undefined) {
    if (
      typeof settings.heartbeatIntervalSeconds !== 'number' ||
      settings.heartbeatIntervalSeconds < 5
    ) {
      errors.push('心跳间隔必须大于等于 5 秒');
    }
  }

  if (settings.heartbeatFailureThreshold !== undefined) {
    if (
      typeof settings.heartbeatFailureThreshold !== 'number' ||
      settings.heartbeatFailureThreshold < 1
    ) {
      errors.push('连续失败阈值必须大于等于 1');
    }
  }

  if (settings.wifiReconnectRetries !== undefined) {
    if (typeof settings.wifiReconnectRetries !== 'number' || settings.wifiReconnectRetries < 0) {
      errors.push('WiFi 重试次数必须大于等于 0');
    }
  }

  if (settings.wifiReconnectCooldownMinutes !== undefined) {
    if (
      typeof settings.wifiReconnectCooldownMinutes !== 'number' ||
      settings.wifiReconnectCooldownMinutes < 0
    ) {
      errors.push('冷却期必须大于等于 0');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 归一化完整应用配置，兼容旧字段
 */
export function normalizeAppConfig(config: Partial<AppConfig> = {}): AppConfig {
  const rawAccounts = Array.isArray(config.accounts) ? config.accounts : [];
  const accounts = rawAccounts.map((account) => createDefaultAccountConfig(account));
  const accountIds = new Set(accounts.map((account) => account.id));
  const rawWifiList = Array.isArray(config.wifiList) ? config.wifiList : [];
  const wifiList = rawWifiList.map((wifi) => {
    const normalized = normalizeWifiConfig(wifi);
    return {
      ...normalized,
      linkedAccountIds: normalized.linkedAccountIds.filter((accountId) =>
        accountIds.has(accountId)
      ),
    };
  });
  const currentAccountId =
    typeof config.currentAccountId === 'string' && accountIds.has(config.currentAccountId)
      ? config.currentAccountId
      : null;

  return {
    accounts,
    currentAccountId,
    wifiList,
    settings: normalizeAppSettings(config.settings),
  };
}

/**
 * 验证完整应用配置
 */
export function validateAppConfig(config: Partial<AppConfig>): ValidationResult {
  const errors: string[] = [];

  if (config.accounts) {
    if (!Array.isArray(config.accounts)) {
      errors.push('账户列表格式无效');
    } else {
      config.accounts.forEach((account, index) => {
        const result = validateAccountConfig(account);
        if (!result.valid) {
          errors.push(`账户 ${index + 1}: ${result.errors.join(', ')}`);
        }
      });
    }
  }

  const accountIds = new Set((config.accounts || []).map((account) => account.id));

  if (config.currentAccountId !== undefined && config.currentAccountId !== null) {
    if (!accountIds.has(config.currentAccountId)) {
      errors.push('当前账户 ID 无效');
    }
  }

  if (config.wifiList) {
    if (!Array.isArray(config.wifiList)) {
      errors.push('WiFi 列表格式无效');
    } else {
      config.wifiList.forEach((wifi, index) => {
        const result = validateWifiConfig(wifi);
        if (!result.valid) {
          errors.push(`WiFi ${index + 1}: ${result.errors.join(', ')}`);
        }

        wifi.linkedAccountIds?.forEach((accountId) => {
          if (!accountIds.has(accountId)) {
            errors.push(`WiFi ${index + 1}: 关联账号 ${accountId} 不存在`);
          }
        });
      });
    }
  }

  if (config.settings) {
    const result = validateAppSettings(config.settings);
    if (!result.valid) {
      errors.push(`设置: ${result.errors.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

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
 * ID 生成计数器（用于同一毫秒内的唯一性）
 */
let idCounter = 0;
let lastTimestamp = 0;

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
