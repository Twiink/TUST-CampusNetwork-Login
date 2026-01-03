/**
 * 联网探测服务
 */

import type {
  NetworkStatus,
  NetworkCallback,
  PollingOptions,
  LatencyResult,
  LatencyStatus,
  WifiDetails,
} from '../types/network';
import { httpGet, isUrlReachable } from '../utils/httpClient';
import type { WifiAdapter } from './WifiAdapter';

/**
 * 网络探测 URL（使用国内服务）
 */
const CONNECTIVITY_CHECK_URLS = [
  'https://www.baidu.com',
  'https://www.speedtest.cn',
  'http://connectivitycheck.platform.hicloud.com/generate_204',
];

/**
 * 默认 Ping 目标（使用百度）
 */
const DEFAULT_PING_TARGET = 'https://www.baidu.com';

/**
 * 备用 Ping 目标（测速网）
 */
const FALLBACK_PING_TARGET = 'https://www.speedtest.cn';

/**
 * 联网探测服务类
 */
export class NetworkDetector {
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private wifiAdapter?: WifiAdapter;

  constructor(wifiAdapter?: WifiAdapter) {
    this.wifiAdapter = wifiAdapter;
  }

  /**
   * 设置 WiFi 适配器
   */
  setWifiAdapter(adapter: WifiAdapter): void {
    this.wifiAdapter = adapter;
  }

  /**
   * 检查网络连通性 (是否有互联网连接)
   */
  async checkConnectivity(): Promise<boolean> {
    for (const url of CONNECTIVITY_CHECK_URLS) {
      try {
        const response = await httpGet(url, { timeout: 5000 });
        if (response.status === 204 || response.ok) {
          return true;
        }
      } catch {
        // 继续尝试下一个 URL
      }
    }
    return false;
  }

  /**
   * 检查是否已通过校园网认证
   */
  async isAuthenticated(): Promise<boolean> {
    try {
      // 检查是否能访问互联网
      const hasInternet = await this.checkConnectivity();
      return hasInternet;
    } catch {
      return false;
    }
  }

  /**
   * 测量网络延迟（Ping）
   * 使用国内服务：百度 → 测速网
   * @returns 延迟测试结果
   */
  async measureLatency(): Promise<LatencyResult> {
    // 先尝试百度
    const baiduResult = await this.testSingleTarget(DEFAULT_PING_TARGET, '百度');
    if (baiduResult.status !== 'timeout') {
      return baiduResult;
    }

    // 百度失败，尝试测速网
    const speedtestResult = await this.testSingleTarget(FALLBACK_PING_TARGET, '测速网');
    if (speedtestResult.status !== 'timeout') {
      return speedtestResult;
    }

    // 都失败了，返回超时
    return {
      value: 9999,
      status: 'timeout',
      target: DEFAULT_PING_TARGET,
      source: '百度',
      timestamp: Date.now(),
    };
  }

  /**
   * 测试单个目标的延迟
   */
  private async testSingleTarget(target: string, source: string): Promise<LatencyResult> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      await fetch(target, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache',
      });

      clearTimeout(timeout);
      const latency = Date.now() - startTime;

      return {
        value: latency,
        status: this.getLatencyStatus(latency),
        target,
        source,
        timestamp: Date.now(),
      };
    } catch {
      return {
        value: 9999,
        status: 'timeout',
        target,
        source,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 根据延迟值判断延迟等级
   * @param latency 延迟值（毫秒）
   * @returns 延迟等级
   */
  private getLatencyStatus(latency: number): LatencyStatus {
    if (latency < 50) return 'excellent';
    if (latency < 100) return 'good';
    if (latency < 200) return 'fair';
    if (latency < 500) return 'poor';
    return 'very-poor';
  }

  /**
   * 获取 WiFi 信号强度
   * @returns 信号强度（0-100）
   */
  async getSignalStrength(): Promise<number> {
    if (!this.wifiAdapter) {
      throw new Error('WifiAdapter not configured');
    }
    return this.wifiAdapter.getSignalStrength();
  }

  /**
   * 获取当前 WiFi 状态
   * 启动时调用，无论是否配置账户
   * @returns 当前 WiFi 状态
   */
  async getCurrentWifiStatus(): Promise<NetworkStatus> {
    const connected = await this.checkConnectivity();
    const authenticated = connected;

    // 如果有 WiFi 适配器，获取 WiFi 详细信息
    if (this.wifiAdapter) {
      try {
        // 使用 getWifiDetails() 而不是直接调用适配器，这样会包含延迟测试
        const wifiDetails = await this.getWifiDetails();
        if (wifiDetails) {
          return {
            connected,
            authenticated,
            wifiConnected: wifiDetails.connected,
            ssid: wifiDetails.ssid,
            signalStrength: wifiDetails.signalStrength,
            linkSpeed: wifiDetails.linkSpeed,
            frequency: wifiDetails.frequency,
            latency: wifiDetails.latency,
            ip: wifiDetails.ipv4,
            ipv6: wifiDetails.ipv6,
            mac: wifiDetails.mac,
            gateway: wifiDetails.gateway,
            dns: wifiDetails.dns?.[0],
            subnetMask: wifiDetails.subnetMask,
            bssid: wifiDetails.bssid,
            channel: wifiDetails.channel,
            security: wifiDetails.security,
          };
        }
      } catch (error) {
        console.error('[NetworkDetector] Failed to get WiFi details:', error);
      }
    }

    // 如果没有 WiFi 适配器或获取失败，返回基本状态
    return {
      connected,
      authenticated,
      wifiConnected: false,
    };
  }

  /**
   * 获取完整的 WiFi 详细信息
   * @returns WiFi 详细信息
   */
  async getWifiDetails(): Promise<WifiDetails | null> {
    if (!this.wifiAdapter) {
      throw new Error('WifiAdapter not configured');
    }

    const details = await this.wifiAdapter.getWifiDetails();
    if (!details) {
      return null;
    }

    // 添加延迟测试
    if (!details.latency) {
      const latency = await this.measureLatency();
      return { ...details, latency };
    }

    return details;
  }

  /**
   * 获取完整网络状态
   */
  async getNetworkStatus(): Promise<NetworkStatus> {
    return this.getCurrentWifiStatus();
  }

  /**
   * 开始轮询检测
   */
  startPolling(callback: NetworkCallback, options: PollingOptions = { interval: 30000 }): void {
    // 如果已在轮询，先停止
    if (this.isPolling) {
      this.stopPolling();
    }

    this.isPolling = true;

    // 立即执行一次
    if (options.immediate !== false) {
      this.getNetworkStatus()
        .then(callback)
        .catch(() => {
          callback({ connected: false, authenticated: false, wifiConnected: false });
        });
    }

    // 定时轮询
    this.pollingTimer = setInterval(async () => {
      try {
        const status = await this.getNetworkStatus();
        callback(status);
      } catch {
        callback({ connected: false, authenticated: false, wifiConnected: false });
      }
    }, options.interval);
  }

  /**
   * 停止轮询检测
   */
  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.isPolling = false;
  }

  /**
   * 检查是否正在轮询
   */
  isPollingActive(): boolean {
    return this.isPolling;
  }

  /**
   * 检查指定 URL 是否可达
   */
  async checkUrl(url: string, timeout = 5000): Promise<boolean> {
    return isUrlReachable(url, timeout);
  }
}

/**
 * 创建网络探测服务实例
 */
export function createNetworkDetector(wifiAdapter?: WifiAdapter): NetworkDetector {
  return new NetworkDetector(wifiAdapter);
}
