/**
 * 移动端 WiFi 适配器实现
 * 支持 Android 平台
 */

import type { WifiAdapter, WifiInfo, WifiDetails, NetworkInfo } from '@repo/shared';
import * as WifiModule from '../native/WifiModule';

/**
 * 移动端 WiFi 适配器
 */
export class MobileWifiAdapter implements WifiAdapter {
  /**
   * 获取当前连接的 WiFi 信息
   */
  async getCurrentWifi(): Promise<WifiInfo | null> {
    try {
      const networkInfo = await WifiModule.getNetworkInfo();

      if (!networkInfo.connected || !networkInfo.ssid) {
        return null;
      }

      return {
        ssid: networkInfo.ssid,
        bssid: networkInfo.bssid || undefined,
        signalStrength: networkInfo.signalStrength || 0,
        linkSpeed: networkInfo.linkSpeed || 0,
        frequency: networkInfo.frequency || 0,
        channel: networkInfo.channel || undefined,
        security: networkInfo.security || undefined,
        connected: true,
      };
    } catch (error) {
      console.error('Failed to get WiFi info:', error);
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

    try {
      const networkInfo = await WifiModule.getNetworkInfo();

      return {
        ...wifiInfo,
        ipv4: networkInfo.ipv4 || undefined,
        ipv6: networkInfo.ipv6 || undefined,
        mac: networkInfo.mac || undefined,
        gateway: networkInfo.gateway || undefined,
        dns: networkInfo.dns || undefined,
        subnetMask: networkInfo.subnetMask || undefined,
      };
    } catch (error) {
      console.error('Failed to get WiFi details:', error);
      return {
        ...wifiInfo,
      };
    }
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
      const networkInfo = await WifiModule.getNetworkInfo();

      return {
        ipv4: networkInfo.ipv4 || undefined,
        ipv6: networkInfo.ipv6 || undefined,
        mac: networkInfo.mac || undefined,
        gateway: networkInfo.gateway || undefined,
        dns: networkInfo.dns || undefined,
        subnetMask: networkInfo.subnetMask || undefined,
      };
    } catch (error) {
      console.error('Failed to get network info:', error);
      return {};
    }
  }

  /**
   * 连接到指定 WiFi（暂不实现）
   */
  async connect(ssid: string, password: string): Promise<boolean> {
    console.warn('WiFi connection not implemented on mobile');
    return false;
  }

  /**
   * 断开 WiFi（暂不实现）
   */
  async disconnect(): Promise<void> {
    console.warn('WiFi disconnection not implemented on mobile');
  }

  /**
   * 获取可用 WiFi 列表（暂不实现）
   */
  async scan(): Promise<WifiInfo[]> {
    console.warn('WiFi scanning not implemented on mobile');
    return [];
  }
}

/**
 * 创建移动端 WiFi 适配器实例
 */
export function createMobileWifiAdapter(): MobileWifiAdapter {
  return new MobileWifiAdapter();
}
