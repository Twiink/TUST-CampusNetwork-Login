/**
 * 桌面端 WiFi 适配器实现
 * 支持 Windows 和 macOS
 */

import type { WifiAdapter, WifiInfo, WifiDetails, NetworkInfo } from '@repo/shared';
import { resolveMacOSWifiInfo } from './wifi-adapter/macos';
import { resolveWindowsWifiInfo } from './wifi-adapter/windows';
import { resolveMacOSNetworkInfo, resolveWindowsNetworkInfo } from './wifi-adapter/netinfo';
import { devLog } from '../utils/dev-log';

/**
 * 桌面端 WiFi 适配器
 */
export class DesktopWifiAdapter implements WifiAdapter {
  private platform: NodeJS.Platform;

  constructor() {
    this.platform = process.platform;
  }

  /**
   * 获取当前连接的 WiFi 信息
   */
  async getCurrentWifi(): Promise<WifiInfo | null> {
    try {
      switch (this.platform) {
        case 'darwin':
          return await resolveMacOSWifiInfo();
        case 'win32':
          return await resolveWindowsWifiInfo();
        default:
          return null;
      }
    } catch (error) {
      devLog.error('Failed to get WiFi info:', error);
      return null;
    }
  }

  /**
   * 获取完整的 WiFi 详细信息
   */
  async getWifiDetails(): Promise<WifiDetails | null> {
    const wifiInfo = await this.getCurrentWifi();
    if (!wifiInfo) {
      return null;
    }

    const networkInfo = await this.getNetworkInfo();

    return {
      ...wifiInfo,
      ipv4: networkInfo.ipv4,
      ipv6: networkInfo.ipv6,
      mac: networkInfo.mac,
      gateway: networkInfo.gateway,
      dns: networkInfo.dns,
      subnetMask: networkInfo.subnetMask,
    };
  }

  /**
   * 获取 WiFi 信号强度
   */
  async getSignalStrength(): Promise<number> {
    const wifi = await this.getCurrentWifi();
    return wifi?.signalStrength || 0;
  }

  /**
   * 获取 WiFi 连接速度
   */
  async getLinkSpeed(): Promise<number> {
    const wifi = await this.getCurrentWifi();
    return wifi?.linkSpeed || 0;
  }

  /**
   * 获取 WiFi 频段
   */
  async getFrequency(): Promise<number> {
    const wifi = await this.getCurrentWifi();
    return wifi?.frequency || 0;
  }

  /**
   * 获取 WiFi 信道
   */
  async getChannel(): Promise<number | null> {
    const wifi = await this.getCurrentWifi();
    return wifi?.channel || null;
  }

  /**
   * 获取 BSSID
   */
  async getBSSID(): Promise<string | null> {
    const wifi = await this.getCurrentWifi();
    return wifi?.bssid || null;
  }

  /**
   * 获取安全类型
   */
  async getSecurity(): Promise<string | null> {
    const wifi = await this.getCurrentWifi();
    return wifi?.security || null;
  }

  /**
   * 获取网络配置信息
   */
  async getNetworkInfo(): Promise<NetworkInfo> {
    try {
      switch (this.platform) {
        case 'darwin':
          return await resolveMacOSNetworkInfo();
        case 'win32':
          return await resolveWindowsNetworkInfo();
        default:
          return {};
      }
    } catch (error) {
      devLog.error('Failed to get network info:', error);
      return {};
    }
  }

  /**
   * 连接到指定 WiFi（暂不实现）
   */
  async connect(_ssid: string, _password: string): Promise<boolean> {
    devLog.warn('WiFi connection not implemented on desktop');
    return false;
  }

  /**
   * 断开 WiFi（暂不实现）
   */
  async disconnect(): Promise<void> {
    devLog.warn('WiFi disconnection not implemented on desktop');
  }

  /**
   * 获取可用 WiFi 列表（暂不实现）
   */
  async scan(): Promise<WifiInfo[]> {
    devLog.warn('WiFi scanning not implemented on desktop');
    return [];
  }
}

/**
 * 创建桌面端 WiFi 适配器实例
 */
export function createDesktopWifiAdapter(): DesktopWifiAdapter {
  return new DesktopWifiAdapter();
}
