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
import type { Logger } from '../models/Logger';

/**
 * 网络探测 URL（使用国内服务）
 */
const DEFAULT_CONNECTIVITY_CHECK_URLS = [
  'https://www.baidu.com',
  'https://www.speedtest.cn',
  'http://connectivitycheck.platform.hicloud.com/generate_204',
];

/**
 * 延迟测试目标
 */
interface LatencyTarget {
  url: string;
  source: string;
}

/**
 * 默认延迟测试目标
 */
const DEFAULT_PING_TARGETS: LatencyTarget[] = [
  {
    url: 'https://www.baidu.com',
    source: '百度',
  },
  {
    url: 'https://www.speedtest.cn',
    source: '测速网',
  },
];

/**
 * 网络探测服务可选配置
 */
export interface NetworkDetectorOptions {
  /** 连通性检测 URL 列表 */
  connectivityCheckUrls?: string[];
  /** 连通性检测超时时间（毫秒） */
  connectivityTimeoutMs?: number;
  /** 延迟测试目标列表，按顺序回退 */
  pingTargets?: LatencyTarget[];
  /** 延迟测试超时时间（毫秒） */
  latencyTimeoutMs?: number;
}

interface ResolvedNetworkDetectorOptions {
  connectivityCheckUrls: string[];
  connectivityTimeoutMs: number;
  pingTargets: LatencyTarget[];
  latencyTimeoutMs: number;
}

/**
 * 联网探测服务类
 */
export class NetworkDetector {
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private wifiAdapter?: WifiAdapter;
  private logger: Logger | null;
  private options: ResolvedNetworkDetectorOptions;

  constructor(wifiAdapter?: WifiAdapter, logger?: Logger, options: NetworkDetectorOptions = {}) {
    this.wifiAdapter = wifiAdapter;
    this.logger = logger || null;
    const pingTargets =
      options.pingTargets && options.pingTargets.length > 0
        ? options.pingTargets
        : DEFAULT_PING_TARGETS;

    this.options = {
      connectivityCheckUrls: [
        ...(options.connectivityCheckUrls?.length
          ? options.connectivityCheckUrls
          : DEFAULT_CONNECTIVITY_CHECK_URLS),
      ],
      connectivityTimeoutMs: options.connectivityTimeoutMs ?? 5000,
      pingTargets: pingTargets.map((target) => ({ ...target })),
      latencyTimeoutMs: options.latencyTimeoutMs ?? 5000,
    };
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
    this.logger?.debug('开始检查网络连通性');

    for (const url of this.options.connectivityCheckUrls) {
      try {
        this.logger?.debug(`尝试连接: ${url}`);
        const response = await httpGet(url, { timeout: this.options.connectivityTimeoutMs });
        if (response.status === 204 || response.ok) {
          this.logger?.success(`网络连通性检查成功`, { URL: url, 状态码: response.status });
          return true;
        }
      } catch (error) {
        this.logger?.debug(`连接失败: ${url}`, {
          错误: error instanceof Error ? error.message : String(error),
        });
        // 继续尝试下一个 URL
      }
    }

    this.logger?.warn('网络连通性检查失败：所有检测URL均不可达');
    return false;
  }

  /**
   * 检查是否已通过校园网认证
   */
  async isAuthenticated(): Promise<boolean> {
    this.logger?.debug('检查校园网认证状态');

    try {
      // 检查是否能访问互联网
      const hasInternet = await this.checkConnectivity();
      if (hasInternet) {
        this.logger?.success('校园网认证检查：已认证');
      } else {
        this.logger?.info('校园网认证检查：未认证或网络不可达');
      }
      return hasInternet;
    } catch (error) {
      this.logger?.error('校园网认证检查异常', {
        错误: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 测量网络延迟（Ping）
   * 使用国内服务：百度 → 测速网
   * @returns 延迟测试结果
   */
  async measureLatency(): Promise<LatencyResult> {
    this.logger?.debug('开始测量网络延迟');

    let lastTimeoutResult: LatencyResult | null = null;

    for (const [index, target] of this.options.pingTargets.entries()) {
      const result = await this.testSingleTarget(target);

      if (result.status !== 'timeout') {
        this.logger?.success(index === 0 ? '延迟测试成功' : '延迟测试成功（备用）', {
          目标: result.source,
          延迟: `${result.value}ms`,
          状态: result.status,
        });
        return result;
      }

      lastTimeoutResult = result;

      if (index < this.options.pingTargets.length - 1) {
        this.logger?.warn(`${target.source} 延迟测试超时，尝试备用服务`);
      }
    }

    this.logger?.error('延迟测试失败：所有目标均超时');

    return (
      lastTimeoutResult || {
        value: 9999,
        status: 'timeout',
        target: this.options.pingTargets[0]?.url || 'unknown',
        source: this.options.pingTargets[0]?.source || '未配置目标',
        timestamp: Date.now(),
      }
    );
  }

  /**
   * 测试单个目标的延迟
   */
  private async testSingleTarget(target: LatencyTarget): Promise<LatencyResult> {
    const startTime = Date.now();
    this.logger?.debug(`测试延迟目标: ${target.source} (${target.url})`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.latencyTimeoutMs);

      await fetch(target.url, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latency = Date.now() - startTime;

      this.logger?.debug(`${target.source} 延迟测试完成: ${latency}ms`);

      return {
        value: latency,
        status: this.getLatencyStatus(latency),
        target: target.url,
        source: target.source,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger?.debug(`${target.source} 延迟测试超时`, {
        错误: error instanceof Error ? error.message : String(error),
      });

      return {
        value: 9999,
        status: 'timeout',
        target: target.url,
        source: target.source,
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
      this.logger?.error('获取WiFi信号强度失败：WiFi适配器未配置');
      throw new Error('WifiAdapter not configured');
    }

    try {
      const strength = await this.wifiAdapter.getSignalStrength();
      this.logger?.debug(`WiFi信号强度: ${strength}%`);
      return strength;
    } catch (error) {
      this.logger?.error('获取WiFi信号强度异常', {
        错误: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 获取当前 WiFi 状态
   * 启动时调用，无论是否配置账户
   * @returns 当前 WiFi 状态
   */
  async getCurrentWifiStatus(): Promise<NetworkStatus> {
    this.logger?.debug('开始获取当前WiFi状态');

    const connected = await this.checkConnectivity();
    const authenticated = connected;

    // 如果有 WiFi 适配器，获取 WiFi 详细信息
    if (this.wifiAdapter) {
      try {
        // 使用 getWifiDetails() 而不是直接调用适配器，这样会包含延迟测试
        const wifiDetails = await this.getWifiDetails();
        if (wifiDetails) {
          this.logger?.success('WiFi状态获取成功', {
            WiFi已连接: wifiDetails.connected,
            SSID: wifiDetails.ssid,
            信号强度: `${wifiDetails.signalStrength}%`,
            连接速度: `${wifiDetails.linkSpeed}Mbps`,
            延迟: wifiDetails.latency ? `${wifiDetails.latency.value}ms` : '未测试',
            认证状态: authenticated ? '已认证' : '未认证',
          });

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
        this.logger?.error('获取WiFi详细信息失败', {
          错误: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 如果没有 WiFi 适配器或获取失败，返回基本状态
    this.logger?.info('WiFi状态（基本）', {
      网络连接: connected ? '已连接' : '未连接',
      认证状态: authenticated ? '已认证' : '未认证',
    });

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
      this.logger?.error('获取WiFi详细信息失败：WiFi适配器未配置');
      throw new Error('WifiAdapter not configured');
    }

    this.logger?.debug('开始获取WiFi详细信息');

    try {
      const details = await this.wifiAdapter.getWifiDetails();
      if (!details) {
        this.logger?.warn('WiFi详细信息为空（可能未连接WiFi）');
        return null;
      }

      // 添加延迟测试
      if (!details.latency) {
        this.logger?.debug('WiFi详细信息中无延迟数据，开始测量延迟');
        const latency = await this.measureLatency();
        const result = { ...details, latency };
        this.logger?.success('WiFi详细信息获取完成（含延迟测试）', {
          SSID: result.ssid,
          信号强度: `${result.signalStrength}%`,
          连接速度: `${result.linkSpeed}Mbps`,
          延迟: `${latency.value}ms`,
        });
        return result;
      }

      this.logger?.success('WiFi详细信息获取完成', {
        SSID: details.ssid,
        信号强度: `${details.signalStrength}%`,
        连接速度: `${details.linkSpeed}Mbps`,
      });

      return details;
    } catch (error) {
      this.logger?.error('获取WiFi详细信息异常', {
        错误: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
      this.logger?.warn('网络状态轮询已在运行，先停止旧的轮询');
      this.stopPolling();
    }

    this.isPolling = true;
    this.logger?.info('开始网络状态轮询', {
      检测间隔: `${options.interval}ms`,
      立即执行: options.immediate !== false ? '是' : '否',
    });

    // 立即执行一次
    if (options.immediate !== false) {
      this.logger?.debug('立即执行首次网络状态检测');
      this.getNetworkStatus()
        .then((status) => {
          this.logger?.debug('首次网络状态检测完成');
          callback(status);
        })
        .catch((error) => {
          this.logger?.error('首次网络状态检测失败', {
            错误: error instanceof Error ? error.message : String(error),
          });
          callback({ connected: false, authenticated: false, wifiConnected: false });
        });
    }

    // 定时轮询
    this.pollingTimer = setInterval(async () => {
      try {
        this.logger?.debug('定时轮询：开始检测网络状态');
        const status = await this.getNetworkStatus();
        callback(status);
      } catch (error) {
        this.logger?.error('定时轮询：网络状态检测失败', {
          错误: error instanceof Error ? error.message : String(error),
        });
        callback({ connected: false, authenticated: false, wifiConnected: false });
      }
    }, options.interval);

    this.logger?.success('网络状态轮询已启动');
  }

  /**
   * 停止轮询检测
   */
  stopPolling(): void {
    if (!this.isPolling) {
      this.logger?.debug('网络状态轮询未运行，无需停止');
      return;
    }

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    this.isPolling = false;
    this.logger?.info('网络状态轮询已停止');
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
    this.logger?.debug(`检查URL可达性: ${url}`);

    try {
      const reachable = await isUrlReachable(url, timeout);
      if (reachable) {
        this.logger?.debug(`URL可达: ${url}`);
      } else {
        this.logger?.debug(`URL不可达: ${url}`);
      }
      return reachable;
    } catch (error) {
      this.logger?.error(`检查URL可达性异常: ${url}`, {
        错误: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

/**
 * 创建网络探测服务实例
 */
export function createNetworkDetector(wifiAdapter?: WifiAdapter, logger?: Logger): NetworkDetector {
  return new NetworkDetector(wifiAdapter, logger);
}
