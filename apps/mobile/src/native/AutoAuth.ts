/**
 * 自动认证原生模块 TypeScript 桥接（仅 Android）
 *
 * 原生后台无法运行 JS，因此认证所需的账号与 WiFi 规则通过 syncProfile 同步给原生层，
 * 由 Android Keystore 加密保存；前台检查与后台服务共用同一原生串行引擎。
 */

import { NativeEventEmitter, NativeModules, type EmitterSubscription } from 'react-native';
import type { AppConfig } from '@repo/shared';

export interface AutoAuthResult {
  networkKey?: string;
  success: boolean;
  message: string;
  /** 触发来源：foreground / wifi / manual / interval / network / worker */
  trigger: string;
  username: string | null;
  attempts: number;
  timestamp: number;
}

export interface AutoAuthProfile {
  revision: number;
  authPaused: boolean;
  enabled: boolean;
  currentAccountId: string | null;
  accounts: Array<{
    id: string;
    username: string;
    password: string;
    isp: string;
    serverUrl: string;
  }>;
  wifiRules: Array<{
    ssid: string;
    requiresAuth: boolean;
    linkedAccountIds: string[];
    /** WiFi 自动重连用；仅在 Keystore 加密后落盘 */
    password: string;
    autoConnect: boolean;
    priority: number;
  }>;
  heartbeatEnabled: boolean;
  failureThreshold: number;
  wifiRetries: number;
  wifiCooldownMinutes: number;
  startupAutoConnect: boolean;
  keepCurrentConnection: boolean;
  notifications: {
    wifiDisconnected: boolean;
    reconnectSuccess: boolean;
    reconnectFailed: boolean;
    authRecovered: boolean;
  };
}

interface AutoAuthModuleInterface {
  syncProfile(json: string): Promise<boolean>;
  login(): Promise<AutoAuthResult | null>;
  logout(): Promise<AutoAuthResult>;
  getSnapshot(): Promise<AuthSnapshot>;
  getReconnectProgress(): Promise<WifiReconnectProgress>;
  checkNow(trigger: string): Promise<AutoAuthResult | null>;
  getLastResult(): Promise<AutoAuthResult | null>;
}

// 调用时再解析原生模块，便于测试注入；NativeModules 访问本身是缓存的
function nativeModule(): AutoAuthModuleInterface | undefined {
  return (NativeModules as { AutoAuthModule?: AutoAuthModuleInterface }).AutoAuthModule;
}

/** 原生模块只在 Android 注册（MainApplication 的 AutoAuthPackage），存在即可用 */
export function isAutoAuthAvailable(): boolean {
  return nativeModule() !== undefined;
}

/** 从应用配置生成原生配置快照（只保留认证、WiFi 重连与通知所需字段） */
export function buildAutoAuthProfile(config: AppConfig): AutoAuthProfile {
  const { settings } = config;
  return {
    revision: config.revision ?? 0,
    authPaused: settings.autoAuthPaused === true,
    enabled: settings.autoReconnect,
    currentAccountId: config.currentAccountId,
    accounts: config.accounts
      .filter(account => account.username && account.password)
      .map(account => ({
        id: account.id,
        username: account.username,
        password: account.password,
        isp: account.isp,
        serverUrl: account.serverUrl,
      })),
    wifiRules: config.wifiList.map(wifi => ({
      ssid: wifi.ssid,
      requiresAuth: wifi.requiresAuth,
      linkedAccountIds: wifi.linkedAccountIds,
      password: wifi.password,
      autoConnect: wifi.autoConnect,
      priority: wifi.priority,
    })),
    heartbeatEnabled: settings.enableHeartbeat,
    failureThreshold: settings.heartbeatFailureThreshold,
    wifiRetries: settings.wifiReconnectRetries,
    wifiCooldownMinutes: settings.wifiReconnectCooldownMinutes,
    startupAutoConnect: settings.startupAutoConnect,
    keepCurrentConnection: settings.keepCurrentConnection,
    notifications: { ...settings.notificationSettings },
  };
}

export async function syncAutoAuthProfile(profile: AutoAuthProfile): Promise<boolean> {
  const module = nativeModule();
  if (!module) return false;
  return module.syncProfile(JSON.stringify(profile));
}

/** 触发一次检查；无需登录时返回 null */
export async function checkAutoAuthNow(trigger: string): Promise<AutoAuthResult | null> {
  const module = nativeModule();
  if (!module) return null;
  return module.checkNow(trigger);
}

export async function getLastAutoAuthResult(): Promise<AutoAuthResult | null> {
  const module = nativeModule();
  if (!module) return null;
  try {
    return await module.getLastResult();
  } catch {
    return null;
  }
}

export function onAutoAuthResult(
  handler: (result: AutoAuthResult) => void
): EmitterSubscription | null {
  const module = nativeModule();
  if (!module) return null;
  return new NativeEventEmitter(module as never).addListener('netmate:autoAuthResult', handler);
}

export default {
  isAutoAuthAvailable,
  buildAutoAuthProfile,
  syncAutoAuthProfile,
  checkAutoAuthNow,
  getLastAutoAuthResult,
  onAutoAuthResult,
};

export interface AuthSnapshot {
  networkKey: string;
  wifiConnected: boolean;
  authenticated: boolean;
  internetReachable: boolean;
  requiresAuth: boolean;
  authenticating: boolean;
  paused: boolean;
  revision: number;
  timestamp: number;
}
export interface WifiReconnectProgress {
  status: 'idle' | 'awaiting-system' | 'connecting' | 'success' | 'failed' | 'cooldown';
  ssid?: string;
  attempt?: number;
  maxAttempts?: number;
  nextRetryAt?: number;
  failedList?: Array<{ ssid: string; reason: string }>;
  message?: string;
}
export async function nativeLogin(): Promise<AutoAuthResult | null> {
  return nativeModule()?.login() ?? null;
}
export async function nativeLogout(): Promise<AutoAuthResult | null> {
  return nativeModule()?.logout() ?? null;
}
export async function getAuthSnapshot(): Promise<AuthSnapshot | null> {
  return nativeModule()?.getSnapshot?.() ?? null;
}
export async function getReconnectProgress(): Promise<WifiReconnectProgress | null> {
  return nativeModule()?.getReconnectProgress?.() ?? null;
}
export function onAuthSnapshot(
  handler: (snapshot: AuthSnapshot) => void
): EmitterSubscription | null {
  const module = nativeModule();
  return module
    ? new NativeEventEmitter(module as never).addListener('netmate:authSnapshot', handler)
    : null;
}
export function onWifiReconnectProgress(
  handler: (snapshot: WifiReconnectProgress) => void
): EmitterSubscription | null {
  const module = nativeModule();
  return module
    ? new NativeEventEmitter(module as never).addListener('netmate:wifiReconnectProgress', handler)
    : null;
}
