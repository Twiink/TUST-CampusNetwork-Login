/**
 * 联网探测服务
 */

import { NetworkStatus, NetworkCallback, PollingOptions } from '../types/network';
import { httpGet, isUrlReachable } from '../utils/httpClient';

/**
 * 网络探测 URL
 */
const CONNECTIVITY_CHECK_URLS = [
  'http://www.gstatic.com/generate_204',
  'http://connectivitycheck.platform.hicloud.com/generate_204',
  'http://connect.rom.miui.com/generate_204',
];

/**
 * 校园网认证检测 URL
 */
const AUTH_CHECK_URL = 'http://10.10.102.50:801/eportal/portal/page/checkstatus';

/**
 * 联网探测服务类
 */
export class NetworkDetector {
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;

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
      // 方法1: 检查是否能访问互联网
      const hasInternet = await this.checkConnectivity();
      if (hasInternet) {
        return true;
      }

      // 方法2: 检查认证服务器状态
      // 如果能访问认证服务器但无法访问互联网，说明未认证
      const canReachAuthServer = await isUrlReachable(AUTH_CHECK_URL, 3000);

      // 如果能访问互联网，说明已认证
      // 如果不能访问互联网但能访问认证服务器，说明未认证
      // 如果都不能访问，可能是网络断开
      return hasInternet;
    } catch {
      return false;
    }
  }

  /**
   * 获取完整网络状态
   */
  async getNetworkStatus(): Promise<NetworkStatus> {
    const connected = await this.checkConnectivity();
    const authenticated = connected;

    return {
      connected,
      authenticated,
    };
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
          callback({ connected: false, authenticated: false });
        });
    }

    // 定时轮询
    this.pollingTimer = setInterval(async () => {
      try {
        const status = await this.getNetworkStatus();
        callback(status);
      } catch {
        callback({ connected: false, authenticated: false });
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
export function createNetworkDetector(): NetworkDetector {
  return new NetworkDetector();
}
