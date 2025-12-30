/**
 * 网络相关类型定义
 */

/**
 * 网络连接状态
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

/**
 * 网络状态
 */
export interface NetworkStatus {
  /** 网络是否连接 */
  connected: boolean;
  /** 是否已认证 */
  authenticated: boolean;
  /** 当前 WiFi SSID */
  ssid?: string;
  /** 当前 IPv4 地址 */
  ipv4?: string;
  /** 当前 IPv6 地址 */
  ipv6?: string;
  /** MAC 地址 */
  mac?: string;
}

/**
 * WiFi 信息
 */
export interface WifiInfo {
  /** WiFi 名称 */
  ssid: string;
  /** BSSID (接入点 MAC 地址) */
  bssid?: string;
  /** 信号强度 (dBm) */
  signalStrength?: number;
  /** 是否加密 */
  secured?: boolean;
}

/**
 * 网络接口信息
 */
export interface NetworkInterface {
  /** 接口名称 */
  name: string;
  /** IPv4 地址 */
  ipv4?: string;
  /** IPv6 地址 */
  ipv6?: string;
  /** MAC 地址 */
  mac?: string;
  /** 是否是内部接口 */
  internal: boolean;
}

/**
 * 网络状态回调
 */
export type NetworkCallback = (status: NetworkStatus) => void;

/**
 * 轮询选项
 */
export interface PollingOptions {
  /** 轮询间隔 (毫秒) */
  interval: number;
  /** 是否立即执行一次 */
  immediate?: boolean;
}
