import type { ConfigApplyResult } from '../../electron/ipc/config';
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
  NETWORK_STATUS_LOADING: 'event:network:statusLoading',
  LOG_ADDED: 'event:log:added',
  LOG_BATCHED: 'event:log:batched',
  AUTH_STATUS_CHANGED: 'event:auth:statusChanged',
  UPDATE_STATUS_CHANGED: 'event:update:statusChanged',
  WIFI_RECONNECT_PROGRESS: 'event:wifi:reconnectProgress',
  WIFI_ALL_RECONNECTS_FAILED: 'event:wifi:allReconnectsFailed',
} as const;

/**
 * WiFi 重连进度
 */
export interface WifiReconnectProgress {
  ssid: string;
  attempt: number;
  maxAttempts: number;
  status:
    | 'connecting'
    | 'authenticating'
    | 'verifying'
    | 'success'
    | 'failed'
    | 'cooldown'
    | 'cancelled';
  wifiId?: string;
  reason?: string;
  nextRetryAt?: number;
  failedList?: WifiReconnectFailure[];
}

/**
 * WiFi 重连失败信息
 */
export interface WifiReconnectFailure {
  wifiId?: string;
  ssid: string;
  priority: number;
  reason: string;
}

/**
 * 所有 WiFi 重连失败事件
 */
export interface WifiAllReconnectsFailed {
  failedList: WifiReconnectFailure[];
}

/**
 * 网络信息
 */
export interface NetworkInfo {
  ipv4: string | null;
  ipv6: string | null;
  mac: string | null;
}

/**
 * WiFi 状态
 */
export interface WifiStatus {
  connected: boolean;
  ssid: string | null;
}

/**
 * 完整网络信息（包含 WiFi）
 */
export interface FullNetworkInfo extends NetworkInfo {
  wifi: WifiStatus;
}

/**
 * 更新状态
 */
export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  progress: number;
  version: string | null;
  error: string | null;
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
    set: (config: AppConfig) => Promise<ConfigApplyResult>;
    reset: () => Promise<ConfigApplyResult>;
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
    retry: () => Promise<void>;
    getReconnectProgress: () => Promise<WifiReconnectProgress | null>;
    list: () => Promise<WifiConfig[]>;
    add: (wifi: Omit<WifiConfig, 'id'>) => Promise<WifiConfig>;
    update: (id: string, updates: Partial<WifiConfig>) => Promise<WifiConfig>;
    remove: (id: string) => Promise<void>;
    /** 配置 ID；兼容唯一 SSID。 */
    switch: (idOrSsid: string) => Promise<boolean>;
    scan: () => Promise<
      Array<{ ssid: string; signalStrength: number; security: string; bssid?: string }>
    >;
  };

  network: {
    getStatus: () => Promise<NetworkStatus>;
    getInfo: () => Promise<NetworkInfo>;
    check: () => Promise<boolean>;
    getWifiSSID: () => Promise<WifiStatus>;
    getFullInfo: () => Promise<FullNetworkInfo>;
  };

  log: {
    query: (
      options?: import('@repo/shared').LogHistoryQuery
    ) => Promise<import('@repo/shared').LogPage>;
    get: (options?: LogQueryOptions) => Promise<LogEntry[]>;
    clear: () => Promise<string>;
    export: (
      format?: 'text' | 'json',
      filter?: import('@repo/shared').LogHistoryFilter
    ) => Promise<string>;
    exportSave: (
      format?: 'text' | 'json',
      filter?: import('@repo/shared').LogHistoryFilter
    ) => Promise<{ success: boolean; path?: string; error?: string }>;
    openDir: () => Promise<{ success: boolean; path?: string; error?: string }>;
  };

  settings: {
    get: () => Promise<AppSettings>;
    update: (settings: Partial<AppSettings>) => Promise<ConfigApplyResult>;
  };

  autoLaunch: {
    get: () => Promise<boolean>;
    set: (enabled: boolean) => Promise<ConfigApplyResult>;
  };

  notification: {
    show: (options: {
      title: string;
      body: string;
      type?: string;
      silent?: boolean;
    }) => Promise<boolean>;
    getEnabled: () => Promise<boolean>;
    setEnabled: (enabled: boolean) => Promise<boolean>;
  };

  update: {
    check: () => Promise<boolean>;
    download: () => Promise<boolean>;
    install: () => Promise<void>;
    getStatus: () => Promise<UpdateStatus>;
  };

  app: {
    getVersion: () => Promise<string>;
    quit: () => Promise<boolean>;
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
