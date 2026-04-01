import { AppSettings, NotificationSettings } from '../types/config';

export const DEFAULT_SERVER_URL = 'http://10.10.102.50:801';

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
