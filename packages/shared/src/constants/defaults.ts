import { AppSettings, NotificationSettings } from '../types/config';

export const DEFAULT_SERVER_URL = 'http://10.10.102.50:801';

/**
 * 连通性/认证判定探测点（必须返回 HTTP 204）。
 * 登录后二次连通性校验、NetworkDetector 均复用此列表。
 * 未认证时校园网门户会拦截并返回 200 门户页，因此只信任严格的 204。
 */
export const DEFAULT_CONNECTIVITY_CHECK_URLS = [
  'http://connectivitycheck.platform.hicloud.com/generate_204',
  'http://connect.rom.miui.com/generate_204',
  'http://www.google.cn/generate_204',
];

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  wifiDisconnected: true,
  reconnectSuccess: true,
  reconnectFailed: true,
  authRecovered: true,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoLaunch: false,
  enableHeartbeat: true,
  heartbeatIntervalSeconds: 30,
  heartbeatFailureThreshold: 3,
  autoReconnect: true,
  wifiReconnectRetries: 3,
  wifiReconnectCooldownMinutes: 5,
  startupAutoConnect: false,
  keepCurrentConnection: true,
  notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
  autoUpdate: true,
};
