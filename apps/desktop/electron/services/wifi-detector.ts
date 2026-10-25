/**
 * 轻量 WiFi SSID 检测：与 DesktopWifiAdapter 共用原生快照与 spawn 兜底，
 * 避免 SSID 变化监听和 UI 状态检测各自维护缓存、重复产生子进程。
 */

import { createDesktopWifiAdapter, DesktopWifiAdapter } from './wifi-adapter';

export interface WifiStatus {
  connected: boolean;
  ssid: string | null;
}

const sharedAdapter: DesktopWifiAdapter = createDesktopWifiAdapter();

export async function getCurrentWifiSSID(): Promise<WifiStatus> {
  const wifi = await sharedAdapter.getCurrentWifi();
  return wifi?.ssid ? { connected: true, ssid: wifi.ssid } : { connected: false, ssid: null };
}
