/**
 * Electron API 类型声明
 */

import type {
  AppConfig,
  AccountConfig,
  WifiConfig,
  AppSettings,
  NetworkStatus,
  LogEntry,
  LogQueryOptions,
  LoginResult,
  LogoutResult,
} from '@repo/shared';

/**
 * IPC 事件通道
 */
export const IPC_EVENTS = {
  NETWORK_STATUS_CHANGED: 'event:network:statusChanged',
  LOG_ADDED: 'event:log:added',
  AUTH_STATUS_CHANGED: 'event:auth:statusChanged',
} as const;

/**
 * 网络信息
 */
export interface NetworkInfo {
  ipv4: string | null;
  ipv6: string | null;
  mac: string | null;
}

/**
 * Electron API 接口
 */
export interface ElectronAPI {
  auth: {
    login: () => Promise<LoginResult>;
    logout: () => Promise<LogoutResult>;
  };

  config: {
    get: () => Promise<AppConfig | null>;
    set: (config: AppConfig) => Promise<boolean>;
    reset: () => Promise<AppConfig>;
  };

  account: {
    list: () => Promise<AccountConfig[]>;
    getCurrent: () => Promise<AccountConfig | null>;
    add: (account: Omit<AccountConfig, 'id'>) => Promise<AccountConfig>;
    update: (id: string, updates: Partial<AccountConfig>) => Promise<AccountConfig>;
    remove: (id: string) => Promise<void>;
    switch: (id: string) => Promise<AccountConfig>;
  };

  wifi: {
    list: () => Promise<WifiConfig[]>;
    add: (wifi: Omit<WifiConfig, 'id'>) => Promise<WifiConfig>;
    update: (id: string, updates: Partial<WifiConfig>) => Promise<WifiConfig>;
    remove: (id: string) => Promise<void>;
  };

  network: {
    getStatus: () => Promise<NetworkStatus>;
    getInfo: () => Promise<NetworkInfo>;
    check: () => Promise<boolean>;
  };

  log: {
    get: (options?: LogQueryOptions) => Promise<LogEntry[]>;
    clear: () => Promise<void>;
    export: (format?: 'text' | 'json') => Promise<string>;
  };

  settings: {
    get: () => Promise<AppSettings>;
    update: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  };

  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  off: (channel: string, callback?: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
