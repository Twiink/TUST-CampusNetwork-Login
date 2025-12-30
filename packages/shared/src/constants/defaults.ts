import { AppSettings } from '../types/config';

export const DEFAULT_SERVER_URL = 'http://10.10.102.50:801';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoLaunch: false,
  enableHeartbeat: false,
  pollingInterval: 30,
  autoReconnect: true,
  maxRetries: 3,
  showNotification: true,
  autoUpdate: true,
};
