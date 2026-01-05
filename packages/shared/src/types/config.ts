export type ISP = 'campus' | 'cmcc' | 'unicom' | 'telecom'; // 校园网, 中国移动, 中国联通, 中国电信

export interface AccountConfig {
  id: string;
  name: string; // Display name
  username: string;
  password: string; // Encrypted in storage, plain here for logic? Or keep opaque?
  serverUrl: string;
  isp: ISP;
}

export interface WifiConfig {
  id: string;
  ssid: string;
  password: string;
  autoConnect: boolean;
  /** 是否需要校园网认证登录 */
  requiresAuth: boolean;
  /** 关联的账号ID (仅当 requiresAuth 为 true 时使用，账号包含服务器地址和服务商信息) */
  linkedAccountId?: string;
  /** 优先级 (数字越小优先级越高) */
  priority: number;
}

export interface AppSettings {
  autoLaunch: boolean;
  /** 是否启用心跳检测 */
  enableHeartbeat: boolean;
  pollingInterval: number; // in seconds
  autoReconnect: boolean;
  maxRetries: number;
  showNotification: boolean;
  autoUpdate: boolean;
}

export interface AppConfig {
  accounts: AccountConfig[];
  currentAccountId: string | null;
  wifiList: WifiConfig[];
  settings: AppSettings;
}
