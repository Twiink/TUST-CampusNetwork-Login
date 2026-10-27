/**
 * 联网探测服务
 */

import type {
  NetworkStatus,
  NetworkCallback,
  PollingOptions,
  LatencyResult,
  WifiDetails,
} from '../types/network';
import { httpGet, isUrlReachable } from '../utils/httpClient';
import { DEFAULT_CONNECTIVITY_CHECK_URLS } from '../constants/defaults';
import type { WifiAdapter } from './WifiAdapter';
import type { Logger } from '../models/Logger';
import {
  DEFAULT_PING_TARGETS,
  type LatencyTarget,
  type NetworkDetectorOptions,
  type ResolvedNetworkDetectorOptions,
} from './detector-options';
import { measureLatency } from './latency';

export type { NetworkDetectorOptions, LatencyTarget };

/**
 * 联网探测服务类
 */
export class NetworkDetector {
  async isWifiEnabled(): Promise<boolean> {
    return (await this.wifiAdapter?.isWifiEnabled?.()) ?? true;
  }
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private tickInFlight = false;
  private latencyCache: { result: LatencyResult; expiresAt: number } | null = null;
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
      connectivityTimeoutMs: options.connectivityTimeoutMs ?? 3000,
      pingTargets: pingTargets.map((target) => ({ ...target })),
      latencyTimeoutMs: options.latencyTimeoutMs ?? 2000,
      latencyCacheMs: options.latencyCacheMs ?? 60_000,
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
    // 严格 204 语义不变；任一探测点成功立即返回，全部失败才判定离线。
    const urls = this.options.connectivityCheckUrls;
    const probes = urls.map(async (url) => {
      const response = await httpGet(url, { timeout: this.options.connectivityTimeoutMs });
      if (response.status !== 204) {
        throw new Error('non-204 response');
      }
      return true;
    });
    const connected = await Promise.any(probes).then(
      () => true,
      () => false
    );
    this.logger?.debug('网络探测完成', {
      探测点数: urls.length,
      结果: connected ? '在线' : '离线',
    });
    return connected;
  }

  /**
   * 检查是否已通过校园网认证
   */
  async isAuthenticated(recentStatus?: NetworkStatus): Promise<boolean> {
    if (recentStatus) {
      return recentStatus.authenticated;
    }
    return this.checkConnectivity();
  }

  /**
   * 测量网络延迟(委托 latency.ts,多目标并行)
   */
  async measureLatency(): Promise<LatencyResult> {
    const cached = this.latencyCache;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    this.logger?.debug('开始测量网络延迟');
    const result = await measureLatency(this.logger, this.options);
    // 超时结果缓存减半，网络恢复后能尽快拿到真实延迟。
    const cacheMs =
      result.status === 'timeout' ? this.options.latencyCacheMs / 2 : this.options.latencyCacheMs;
    this.latencyCache = { result, expiresAt: Date.now() + cacheMs };
    return result;
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
    const [connectedResult, wifiResult] = await Promise.allSettled([
      this.checkConnectivity(),
      this.wifiAdapter ? this.wifiAdapter.getWifiDetails() : Promise.resolve(null),
    ]);
    const connected = connectedResult.status === 'fulfilled' ? connectedResult.value : false;
    const wifiDetails = wifiResult.status === 'fulfilled' ? wifiResult.value : null;

    if (!wifiDetails) {
      const status: NetworkStatus = {
        connected,
        authenticated: connected,
        wifiConnected: false,
      };
      this.logger?.debug('网络状态检测完成', {
        网络连接: connected ? '在线' : '离线',
        WiFi状态: wifiDetails ? '已获取' : '不可用',
      });
      return status;
    }

    // 适配器已带延迟时直接复用；只有缺少延迟才额外探测。
    const latency = wifiDetails.latency ?? (connected ? await this.measureLatency() : undefined);
    const status: NetworkStatus = {
      connected,
      authenticated: connected,
      wifiConnected: wifiDetails.connected,
      ssid: wifiDetails.ssid,
      signalStrength: wifiDetails.signalStrength,
      linkSpeed: wifiDetails.linkSpeed,
      frequency: wifiDetails.frequency,
      latency,
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
    this.logger?.debug('网络状态检测完成', {
      网络连接: '在线',
      SSID: status.ssid || '未知',
      信号强度: status.signalStrength,
      延迟: latency ? `${latency.value}ms` : '未探测',
    });
    return status;
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
          延迟: latency ? `${latency.value}ms` : '未探测',
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
      void this.runImmediatePollingTick(callback);
    }

    // 定时轮询
    this.pollingTimer = setInterval(() => {
      void this.runPollingTick(callback);
    }, options.interval);

    this.logger?.success('网络状态轮询已启动');
  }

  private async runImmediatePollingTick(callback: NetworkCallback): Promise<void> {
    if (this.tickInFlight) {
      this.logger?.warn('上一轮网络检测未完成，跳过首次检测');
      return;
    }

    this.tickInFlight = true;
    try {
      const status = await this.getNetworkStatus();
      this.logger?.debug('首次网络状态检测完成');
      await this.dispatchPollingResult(callback, status);
    } catch (error) {
      this.logger?.error('首次网络状态检测失败', {
        错误: error instanceof Error ? error.message : String(error),
      });
      callback({ connected: false, authenticated: false, wifiConnected: false });
    } finally {
      this.tickInFlight = false;
    }
  }

  private async runPollingTick(callback: NetworkCallback): Promise<void> {
    if (this.tickInFlight) {
      this.logger?.warn('上一轮网络检测未完成，跳过本轮检测');
      return;
    }
    this.tickInFlight = true;
    try {
      callback(await this.getNetworkStatus());
    } catch (error) {
      this.logger?.error('定时轮询：网络状态检测失败', {
        错误: error instanceof Error ? error.message : String(error),
      });
      callback({ connected: false, authenticated: false, wifiConnected: false });
    } finally {
      this.tickInFlight = false;
    }
  }

  private async dispatchPollingResult(
    callback: NetworkCallback,
    status: NetworkStatus
  ): Promise<void> {
    try {
      await callback(status);
    } catch (error) {
      this.logger?.error('网络状态回调执行失败', {
        错误: error instanceof Error ? error.message : String(error),
      });
    }
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
  return new NetworkDetector(wifiAdapter, logger, {
    // UI 展示值不需要多目标竞争；单目标 + 缓存足以覆盖心跳展示。
    pingTargets: [DEFAULT_PING_TARGETS[0]],
  });
}
