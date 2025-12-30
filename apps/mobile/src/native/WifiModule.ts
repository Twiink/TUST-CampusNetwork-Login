/**
 * WiFi 原生模块 TypeScript 桥接
 *
 * 提供跨平台的 WiFi 信息获取能力
 */

import { NativeModules, Platform, PermissionsAndroid } from 'react-native';

/**
 * 网络信息接口
 */
export interface NetworkInfo {
  /** WiFi 是否已启用 */
  wifiEnabled: boolean;
  /** 是否已连接 WiFi */
  connected: boolean;
  /** 当前连接的 WiFi SSID */
  ssid: string | null;
  /** IPv4 地址 */
  ipv4: string | null;
  /** IPv6 地址 */
  ipv6: string | null;
  /** MAC 地址 */
  mac: string | null;
}

/**
 * WiFi 状态接口
 */
export interface WifiStatus {
  connected: boolean;
  ssid: string | null;
}

// 原生模块接口
interface WifiModuleInterface {
  getCurrentSSID(): Promise<string | null>;
  getIPAddress(): Promise<string | null>;
  getIPv6Address(): Promise<string | null>;
  getMacAddress(): Promise<string | null>;
  isWifiEnabled(): Promise<boolean>;
  isConnected(): Promise<boolean>;
  getNetworkInfo(): Promise<NetworkInfo>;
  checkLocationPermission(): Promise<boolean>;
}

// 获取原生模块
const { WifiModule } = NativeModules as { WifiModule: WifiModuleInterface | undefined };

/**
 * 检查并请求 Android 位置权限
 * Android 8.0+ 需要位置权限才能获取 WiFi SSID
 */
export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: '位置权限',
        message: '需要位置权限来获取当前连接的 WiFi 名称',
        buttonNeutral: '稍后询问',
        buttonNegative: '取消',
        buttonPositive: '确定',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('requestLocationPermission error:', err);
    return false;
  }
}

/**
 * 检查是否有位置权限
 */
export async function hasLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (!WifiModule) {
    console.warn('WifiModule is not available');
    return false;
  }

  try {
    return await WifiModule.checkLocationPermission();
  } catch (error) {
    console.warn('hasLocationPermission error:', error);
    return false;
  }
}

/**
 * 获取当前连接的 WiFi SSID
 */
export async function getCurrentSSID(): Promise<string | null> {
  if (!WifiModule) {
    console.warn('WifiModule is not available');
    return null;
  }

  try {
    return await WifiModule.getCurrentSSID();
  } catch (error) {
    console.warn('getCurrentSSID error:', error);
    return null;
  }
}

/**
 * 获取当前设备的 IPv4 地址
 */
export async function getIPAddress(): Promise<string | null> {
  if (!WifiModule) {
    console.warn('WifiModule is not available');
    return null;
  }

  try {
    return await WifiModule.getIPAddress();
  } catch (error) {
    console.warn('getIPAddress error:', error);
    return null;
  }
}

/**
 * 获取当前设备的 IPv6 地址
 */
export async function getIPv6Address(): Promise<string | null> {
  if (!WifiModule) {
    console.warn('WifiModule is not available');
    return null;
  }

  try {
    return await WifiModule.getIPv6Address();
  } catch (error) {
    console.warn('getIPv6Address error:', error);
    return null;
  }
}

/**
 * 获取 WiFi MAC 地址
 */
export async function getMacAddress(): Promise<string | null> {
  if (!WifiModule) {
    console.warn('WifiModule is not available');
    return null;
  }

  try {
    return await WifiModule.getMacAddress();
  } catch (error) {
    console.warn('getMacAddress error:', error);
    return null;
  }
}

/**
 * 检查 WiFi 是否已启用
 */
export async function isWifiEnabled(): Promise<boolean> {
  if (!WifiModule) {
    console.warn('WifiModule is not available');
    return false;
  }

  try {
    return await WifiModule.isWifiEnabled();
  } catch (error) {
    console.warn('isWifiEnabled error:', error);
    return false;
  }
}

/**
 * 检查是否已连接到 WiFi
 */
export async function isConnected(): Promise<boolean> {
  if (!WifiModule) {
    console.warn('WifiModule is not available');
    return false;
  }

  try {
    return await WifiModule.isConnected();
  } catch (error) {
    console.warn('isConnected error:', error);
    return false;
  }
}

/**
 * 获取完整的网络信息
 */
export async function getNetworkInfo(): Promise<NetworkInfo> {
  if (!WifiModule) {
    console.warn('WifiModule is not available');
    return {
      wifiEnabled: false,
      connected: false,
      ssid: null,
      ipv4: null,
      ipv6: null,
      mac: null,
    };
  }

  try {
    return await WifiModule.getNetworkInfo();
  } catch (error) {
    console.warn('getNetworkInfo error:', error);
    return {
      wifiEnabled: false,
      connected: false,
      ssid: null,
      ipv4: null,
      ipv6: null,
      mac: null,
    };
  }
}

/**
 * 获取 WiFi 状态（简化版）
 */
export async function getWifiStatus(): Promise<WifiStatus> {
  const connected = await isConnected();
  const ssid = connected ? await getCurrentSSID() : null;
  return { connected, ssid };
}

/**
 * 检查原生模块是否可用
 */
export function isNativeModuleAvailable(): boolean {
  return WifiModule !== undefined;
}

export default {
  requestLocationPermission,
  hasLocationPermission,
  getCurrentSSID,
  getIPAddress,
  getIPv6Address,
  getMacAddress,
  isWifiEnabled,
  isConnected,
  getNetworkInfo,
  getWifiStatus,
  isNativeModuleAvailable,
};
