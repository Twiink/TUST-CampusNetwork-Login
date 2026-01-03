/**
 * 网络相关类型定义
 */

/**
 * 网络连接状态
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

/**
 * 延迟等级
 */
export type LatencyStatus = 'excellent' | 'good' | 'fair' | 'poor' | 'very-poor' | 'timeout';

/**
 * 延迟测试结果
 */
export interface LatencyResult {
  /** 延迟值（毫秒） */
  value: number;
  /** 延迟等级 */
  status: LatencyStatus;
  /** 测试目标地址 */
  target: string;
  /** 测试时间戳 */
  timestamp: number;
}

/**
 * 网络状态
 */
export interface NetworkStatus {
  /** 网络是否连接 */
  connected: boolean;
  /** 是否已认证（需要认证的 WiFi） */
  authenticated: boolean;
  /** WiFi 是否连接（最高优先级） */
  wifiConnected: boolean;
  /** 当前 WiFi SSID（若已连接，必须显示） */
  ssid?: string;
  /** 信号强度（0-100） */
  signalStrength?: number;
  /** 连接速度（Mbps） */
  linkSpeed?: number;
  /** 频段（MHz：2400 或 5000） */
  frequency?: number;
  /** 延迟信息 */
  latency?: LatencyResult;
  /** 当前 IPv4 地址 */
  ip?: string;
  /** 当前 IPv6 地址 */
  ipv6?: string;
  /** MAC 地址 */
  mac?: string;
  /** 网关地址 */
  gateway?: string;
  /** DNS 服务器地址 */
  dns?: string;
  /** 子网掩码 */
  subnetMask?: string;
  /** 路由器 MAC 地址 */
  bssid?: string;
  /** WiFi 信道 */
  channel?: number;
  /** 安全类型（如 WPA2-PSK、WPA3） */
  security?: string;
  /** 该 WiFi 是否在配置列表中 */
  isConfigured?: boolean;
  /** 该 WiFi 是否需要认证 */
  requiresAuth?: boolean;
  /** 是否已关联账户 */
  hasLinkedAccount?: boolean;
}

/**
 * WiFi 信息
 */
export interface WifiInfo {
  /** WiFi 名称 */
  ssid: string;
  /** 路由器 MAC 地址 */
  bssid?: string;
  /** 信号强度 (0-100) */
  signalStrength: number;
  /** 连接速度 (Mbps) */
  linkSpeed?: number;
  /** 频段 (2400/5000 MHz) */
  frequency?: number;
  /** 信道 */
  channel?: number;
  /** 安全类型（如 WPA2-PSK） */
  security?: string;
  /** 是否已连接 */
  connected: boolean;
}

/**
 * WiFi 详细信息（扩展 WifiInfo）
 */
export interface WifiDetails extends WifiInfo {
  /** IPv4 地址 */
  ipv4?: string;
  /** IPv6 地址 */
  ipv6?: string;
  /** 本机 MAC 地址 */
  mac?: string;
  /** 网关地址 */
  gateway?: string;
  /** DNS 服务器列表 */
  dns?: string[];
  /** 子网掩码 */
  subnetMask?: string;
  /** 延迟信息 */
  latency?: LatencyResult;
}

/**
 * 网络配置信息
 */
export interface NetworkInfo {
  /** IPv4 地址 */
  ipv4?: string;
  /** IPv6 地址 */
  ipv6?: string;
  /** MAC 地址 */
  mac?: string;
  /** 网关地址 */
  gateway?: string;
  /** DNS 服务器列表 */
  dns?: string[];
  /** 子网掩码 */
  subnetMask?: string;
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
