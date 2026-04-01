export type ISP = 'campus' | 'cmcc' | 'cucc' | 'ctcc'; // 校园网, 中国移动, 中国联通, 中国电信

export interface AccountConfig {
  id: string;
  name: string; // Display name
  username: string;
  password: string; // Encrypted in storage, plain here for logic? Or keep opaque?
  serverUrl: string;
  isp: ISP;
}

export interface NotificationSettings {
  wifiDisconnected: boolean;
  reconnectSuccess: boolean;
  reconnectFailed: boolean;
  authRecovered: boolean;
}

export interface WifiConfig {
  id: string;
  ssid: string;
  password: string;
  autoConnect: boolean;
  /** 是否需要校园网认证登录 */
  requiresAuth: boolean;
  /** 安全类型，用于辅助区分同名 WiFi */
  security?: string;
  /** BSSID，用于辅助区分同名 WiFi */
  bssid?: string;
  /** 关联的账号 ID 列表（按认证尝试顺序排列） */
  linkedAccountIds: string[];
  /** @deprecated 兼容旧界面，始终映射到 linkedAccountIds[0] */
  linkedAccountId?: string;
  /** 优先级 (数字越小优先级越高) */
  priority: number;
  /** 最近一次成功连接时间戳 */
  lastConnectedAt: number | null;
}

export interface AppSettings {
  autoLaunch: boolean;
  /** 是否启用心跳检测 */
  enableHeartbeat: boolean;
  heartbeatIntervalSeconds: number;
  /** @deprecated 兼容旧界面，等同于 heartbeatIntervalSeconds */
  pollingInterval?: number;
  /** 连续失败阈值 */
  heartbeatFailureThreshold: number;
  autoReconnect: boolean;
  /** 单个 WiFi 重试次数 */
  wifiReconnectRetries: number;
  /** @deprecated 兼容旧界面，等同于 wifiReconnectRetries */
  maxRetries?: number;
  /** WiFi 重连冷却期（分钟） */
  wifiReconnectCooldownMinutes: number;
  /** 启动时未连接 WiFi 是否自动连接 */
  startupAutoConnect: boolean;
  /** 启动时若已连接已记录 WiFi，是否保持当前连接 */
  keepCurrentConnection: boolean;
  /** 各通知场景的独立开关 */
  notificationSettings: NotificationSettings;
  /** @deprecated 兼容旧界面，等同于 notificationSettings 四项同时为 true */
  showNotification?: boolean;
  autoUpdate: boolean;
}

export interface AppConfig {
  accounts: AccountConfig[];
  currentAccountId: string | null;
  wifiList: WifiConfig[];
  settings: AppSettings;
}
