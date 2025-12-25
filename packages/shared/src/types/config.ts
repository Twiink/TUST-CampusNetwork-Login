export type ISP = 'campus' | 'cmcc' | 'cucc' | 'ctcc'; // 校园网, 中国移动, 中国联通, 中国电信

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
}

export interface AppSettings {
  autoLaunch: boolean;
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
