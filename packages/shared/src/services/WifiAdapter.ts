/**
 * WiFi 适配器接口
 * 平台特定实现需要继承此接口
 */

import type { WifiInfo, WifiDetails, NetworkInfo } from '../types/network';

/**
 * WiFi 适配器接口
 * 负责 WiFi 相关操作，包括启动时获取当前 WiFi 连接状态
 */
export interface WifiAdapter {
  /**
   * 获取当前连接的 WiFi 信息
   * 启动时调用，检测是否已连接 WiFi
   * @returns WiFi 基本信息，如果未连接则返回 null
   */
  getCurrentWifi(): Promise<WifiInfo | null>;

  /**
   * 获取完整的 WiFi 详细信息（包括网络配置）
   * @returns WiFi 详细信息，如果未连接则返回 null
   */
  getWifiDetails(): Promise<WifiDetails | null>;

  /**
   * 获取 WiFi 信号强度
   * @returns 信号强度（0-100）
   */
  getSignalStrength(): Promise<number>;

  /**
   * 获取 WiFi 连接速度
   * @returns 连接速度（Mbps）
   */
  getLinkSpeed(): Promise<number>;

  /**
   * 获取 WiFi 频段
   * @returns 频段（MHz：2400 或 5000）
   */
  getFrequency(): Promise<number>;

  /**
   * 获取 WiFi 信道
   * @returns 信道号，如果无法获取则返回 null
   */
  getChannel(): Promise<number | null>;

  /**
   * 获取 BSSID（路由器 MAC 地址）
   * @returns BSSID，如果无法获取则返回 null
   */
  getBSSID(): Promise<string | null>;

  /**
   * 获取安全类型
   * @returns 安全类型（如 WPA2-PSK、WPA3），如果无法获取则返回 null
   */
  getSecurity(): Promise<string | null>;

  /**
   * 获取网络配置信息
   * @returns 网络配置信息
   */
  getNetworkInfo(): Promise<NetworkInfo>;

  /**
   * 连接到指定 WiFi
   * @param ssid WiFi 名称
   * @param password WiFi 密码
   * @returns 连接是否成功
   */
  connect(ssid: string, password: string): Promise<boolean>;

  /**
   * 断开 WiFi
   */
  disconnect(): Promise<void>;

  /**
   * 获取可用 WiFi 列表
   * @returns WiFi 列表
   */
  scan(): Promise<WifiInfo[]>;
}
