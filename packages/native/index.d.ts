export interface NativeWifiInfo {
  ssid?: string | null;
  bssid?: string | null;
  rssi?: number | null;
  linkSpeed?: number | null;
  channel?: number | null;
  frequency?: number | null;
  security?: string | null;
}

export interface NativeNetworkInfo {
  ipv4?: string | null;
  ipv6?: string | null;
  mac?: string | null;
  gateway?: string | null;
  dns?: string[] | null;
  subnetMask?: string | null;
}

export declare function currentWifi(): NativeWifiInfo | null;
export declare function networkInfo(): NativeNetworkInfo | null;
export declare function watchNetwork(callback: () => void): boolean;
