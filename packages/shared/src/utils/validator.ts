/**
 * 数据验证工具
 */

import { AccountConfig, WifiConfig, AppSettings, AppConfig, ISP } from '../types/config';
import { DEFAULT_APP_SETTINGS, DEFAULT_SERVER_URL } from '../constants/defaults';

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
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

  // 如果需要认证，验证关联账号ID
  if (config.requiresAuth && !config.linkedAccountId) {
    errors.push('需要认证的 WiFi 必须关联一个账号');
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

  if (settings.pollingInterval !== undefined) {
    if (typeof settings.pollingInterval !== 'number' || settings.pollingInterval < 5) {
      errors.push('轮询间隔必须大于等于 5 秒');
    }
  }

  if (settings.maxRetries !== undefined) {
    if (typeof settings.maxRetries !== 'number' || settings.maxRetries < 0) {
      errors.push('最大重试次数必须大于等于 0');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证完整应用配置
 */
export function validateAppConfig(config: Partial<AppConfig>): ValidationResult {
  const errors: string[] = [];

  // 验证账户列表
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

  // 验证当前账户 ID
  if (config.currentAccountId !== undefined && config.currentAccountId !== null) {
    if (config.accounts && !config.accounts.find(a => a.id === config.currentAccountId)) {
      errors.push('当前账户 ID 无效');
    }
  }

  // 验证 WiFi 列表
  if (config.wifiList) {
    if (!Array.isArray(config.wifiList)) {
      errors.push('WiFi 列表格式无效');
    } else {
      config.wifiList.forEach((wifi, index) => {
        const result = validateWifiConfig(wifi);
        if (!result.valid) {
          errors.push(`WiFi ${index + 1}: ${result.errors.join(', ')}`);
        }
      });
    }
  }

  // 验证设置
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
export function createDefaultWifiConfig(partial: Partial<WifiConfig> = {}): WifiConfig {
  return {
    id: partial.id || generateId(),
    ssid: partial.ssid || '',
    password: partial.password || '',
    autoConnect: partial.autoConnect ?? true,
    requiresAuth: partial.requiresAuth ?? true,
    linkedAccountId: partial.linkedAccountId,
    priority: partial.priority ?? 0,
  };
}

/**
 * 创建默认应用配置
 */
export function createDefaultAppConfig(partial: Partial<AppConfig> = {}): AppConfig {
  return {
    accounts: partial.accounts || [],
    currentAccountId: partial.currentAccountId ?? null,
    wifiList: partial.wifiList || [],
    settings: {
      ...DEFAULT_APP_SETTINGS,
      ...partial.settings,
    },
  };
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}
