/**
 * WiFi 事件监听服务
 * 监听系统 WiFi 状态变化（连接/断开），自动触发网络状态更新
 *
 * 支持平台：
 * - macOS: 使用 networksetup 轮询检测（system_profiler 太慢）
 * - Windows: 使用 netsh wlan show interfaces 轮询检测
 *
 * 注意：这里使用轻量级轮询（仅检测 SSID 变化），不是完整的网络状态轮询
 */

import { BrowserWindow } from 'electron';
import type { NetworkDetector, Logger, WifiManager, ConfigManager } from '@repo/shared';
import { enrichStatusAuthFields } from './network';
import type { AutoReconnectService } from './auto-reconnect';
import type { WifiSwitcherService } from './wifi-switcher';
import { IPC_EVENTS } from '../ipc/channels';
import { executeAutoReconnect } from './wifi-event-listener/reconnect-flow';
import type {
  WifiReconnectProgress,
  WifiReconnectFailure,
  WifiAllReconnectsFailed,
} from './wifi-event-listener/reconnect-flow';
import { probeCurrentSsid } from './wifi-event-listener/ssid-probe';
import * as nativeModule from '@repo/native';

export type {
  WifiReconnectProgress,
  WifiReconnectFailure,
  WifiAllReconnectsFailed,
} from './wifi-event-listener/reconnect-flow';

export interface WifiEventListenerOptions {
  /** 检测间隔（毫秒），默认 1000ms (1秒) */
  checkInterval?: number;
  /** 网络检测器实例 */
  networkDetector: NetworkDetector;
  /** 日志记录器 */
  logger: Logger;
  /** 主窗口实例（用于发送 IPC 事件） */
  window: BrowserWindow | null;
  /** WiFi管理器（可选） */
  wifiManager?: WifiManager;
  /** WiFi切换服务（可选） */
  wifiSwitcherService?: WifiSwitcherService;
  /** 配置管理器（可选，用于获取maxRetries等设置） */
  configManager?: ConfigManager;
  /** 认证自动重连服务（可选）：WiFi 连接/切换后立即触发认证检测，不再等待心跳周期 */
  autoReconnectService?: AutoReconnectService;
}

/**
 * WiFi 事件监听器类
 */
export class WifiEventListener {
  private platform: NodeJS.Platform;
  private checkInterval: number;
  private networkDetector: NetworkDetector;
  private logger: Logger;
  private window: BrowserWindow | null;
  private wifiManager?: WifiManager;
  private wifiSwitcherService?: WifiSwitcherService;
  private configManager?: ConfigManager;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nativeEventTimer: ReturnType<typeof setTimeout> | null = null;
  private nativeWatchStarted = false;
  private lastSsid: string | null = null;
  private isRunning = false;
  private isReconnecting = false; // 防止重复重连
  private lastErrorLogged = false; // 防止错误日志过多
  private autoReconnectService?: AutoReconnectService;

  constructor(options: WifiEventListenerOptions) {
    this.platform = process.platform;
    this.checkInterval = options.checkInterval || 3000;
    this.networkDetector = options.networkDetector;
    this.logger = options.logger;
    this.window = options.window;
    this.wifiManager = options.wifiManager;
    this.wifiSwitcherService = options.wifiSwitcherService;
    this.configManager = options.configManager;
    this.autoReconnectService = options.autoReconnectService;
  }

  /**
   * 启动 WiFi 事件监听
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('WiFi 事件监听器已在运行');
      return;
    }

    this.isRunning = true;
    this.logger.info('===== WiFi 事件监听器启动 =====');
    this.logger.info(`平台: ${this.platform}`);
    this.logger.info(`检测间隔: ${this.checkInterval}ms`);

    // 立即执行一次检测，获取初始状态
    this.logger.info('执行初始 WiFi 状态检测...');
    this.checkWifiChange().catch((error) => {
      this.logger.error('初始 WiFi 状态检测失败', error);
    });

    // 原生事件驱动优先（nl80211 组播 / WlanRegisterNotification / CoreWLAN diff）
    const nativeWatchSupported = this.startNativeWatch();

    // 原生事件承担实时性；兜底轮询只做状态一致性校验，降到 30s。
    const fallbackInterval = nativeWatchSupported ? 30_000 : this.checkInterval;
    this.timer = setInterval(async () => {
      try {
        await this.checkWifiChange();
      } catch (error) {
        this.logger.error('WiFi 状态检测失败', error);
      }
    }, fallbackInterval);

    this.logger.info(
      `WiFi 事件监听器已启动，原生事件: ${nativeWatchSupported ? '已启用' : '不可用'}，兜底间隔: ${fallbackInterval}ms`
    );
  }

  /**
   * 注册原生网络变化事件。事件到达时立即检测并做 1s 去抖，
   * 避免 mlme/scan 组播风暴下重复拉全量状态。
   */
  private startNativeWatch(): boolean {
    if (this.nativeWatchStarted || typeof nativeModule.watchNetwork !== 'function') {
      return this.nativeWatchStarted;
    }
    try {
      const supported = nativeModule.watchNetwork(() => {
        if (this.nativeEventTimer) {
          return;
        }
        this.nativeEventTimer = setTimeout(() => {
          this.nativeEventTimer = null;
          this.checkWifiChange().catch((error) => {
            this.logger.error('原生 WiFi 事件检测失败', error);
          });
        }, 1000);
      });
      this.nativeWatchStarted = supported === true;
    } catch (error) {
      this.nativeWatchStarted = false;
      this.logger.debug('原生 WiFi 事件注册失败，使用兜底轮询', { error });
    }
    return this.nativeWatchStarted;
  }

  /**
   * 停止 WiFi 事件监听
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.nativeEventTimer) {
      clearTimeout(this.nativeEventTimer);
      this.nativeEventTimer = null;
    }

    this.isRunning = false;
    this.lastSsid = null;
    this.logger.info('WiFi 事件监听器已停止');
  }

  /**
   * 更新窗口引用
   */
  setWindow(window: BrowserWindow | null): void {
    this.window = window;
  }

  /**
   * 动态调整检测间隔（用于窗口隐藏到托盘时降频，减少常驻 CPU 开销）。
   * 仅在运行中且间隔确有变化时重建定时器。
   */
  setCheckInterval(intervalMs: number): void {
    if (intervalMs <= 0 || intervalMs === this.checkInterval) {
      return;
    }
    this.checkInterval = intervalMs;
    if (this.isRunning && this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(async () => {
        try {
          await this.checkWifiChange();
        } catch (error) {
          this.logger.error('WiFi 状态检测失败', error);
        }
      }, this.checkInterval);
      this.logger.info(`WiFi 检测间隔已调整为: ${this.checkInterval}ms`);
    }
  }

  /**
   * 检测 WiFi 状态变化
   */
  private async checkWifiChange(): Promise<void> {
    try {
      // 使用轻量级方法快速获取当前 SSID
      const currentSsid = await probeCurrentSsid(this.platform, this.logger);

      // 重置错误标志（成功获取到SSID）
      if (this.lastErrorLogged) {
        this.lastErrorLogged = false;
        this.logger.info('WiFi 状态检测已恢复正常');
      }

      // 检测 SSID 是否发生变化
      if (currentSsid !== this.lastSsid) {
        const prevSsid = this.lastSsid;
        this.lastSsid = currentSsid;

        // 记录变化
        if (prevSsid === null && currentSsid) {
          this.logger.info(`WiFi 已连接: ${currentSsid}`);
        } else if (prevSsid && currentSsid === null) {
          this.logger.info(`WiFi 已断开: ${prevSsid}`);

          // WiFi断开时尝试自动重连
          await this.handleWifiDisconnect(prevSsid);
        } else if (prevSsid && currentSsid) {
          this.logger.info(`WiFi 已切换: ${prevSsid} → ${currentSsid}`);
        }

        // 触发网络状态更新
        await this.notifyNetworkStatusChange();
      }
    } catch (error) {
      // 只记录一次错误，避免日志过多
      if (!this.lastErrorLogged) {
        this.logger.error('WiFi 状态检测失败', error);
        this.lastErrorLogged = true;
      }
    }
  }

  /**
   * 处理WiFi断开事件 - 尝试自动重连
   * 实现三阶段重连流程：
   * 1. 单个WiFi重连（重试N次）
   * 2. 优先级切换（按优先级尝试其他WiFi）
   * 3. 所有WiFi失败（停止重连，显示失败列表）
   */
  private async handleWifiDisconnect(disconnectedSsid: string): Promise<void> {
    // 如果正在重连或没有配置WiFi管理器和切换服务，则跳过
    if (this.isReconnecting || !this.wifiManager || !this.wifiSwitcherService) {
      return;
    }

    this.isReconnecting = true;
    try {
      await executeAutoReconnect(disconnectedSsid, {
        logger: this.logger,
        wifiManager: this.wifiManager,
        wifiSwitcherService: this.wifiSwitcherService,
        configManager: this.configManager,
        onProgress: (progress) => this.broadcastReconnectProgress(progress),
        onAllFailed: (failedList) => this.broadcastAllWifiFailed(failedList),
        onReconnected: () => this.finalizeSuccessfulReconnect(),
      });
    } finally {
      this.isReconnecting = false;
      this.logger.info(`===== WiFi自动重连流程结束 =====`);
    }
    return;
  }

  /**
   * 成功重连后的后续处理
   */
  private async finalizeSuccessfulReconnect(): Promise<void> {
    // 等待WiFi连接稳定
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 更新网络状态
    await this.notifyNetworkStatusChange();
  }

  /**
   * 广播WiFi重连进度到UI
   */
  private broadcastReconnectProgress(progress: WifiReconnectProgress): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    this.window.webContents.send(IPC_EVENTS.WIFI_RECONNECT_PROGRESS, progress);
  }

  /**
   * 广播所有WiFi连接失败事件到UI
   */
  private broadcastAllWifiFailed(failedList: WifiReconnectFailure[]): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const event: WifiAllReconnectsFailed = { failedList };
    this.window.webContents.send(IPC_EVENTS.WIFI_ALL_RECONNECTS_FAILED, event);
  }

  /**
   * 通知网络状态变化
   */
  private async notifyNetworkStatusChange(): Promise<void> {
    try {
      // 检查窗口是否有效
      if (!this.window || this.window.isDestroyed()) {
        this.logger.warn('窗口无效或已销毁，无法发送网络状态更新');
        return;
      }

      // 如果WiFi已断开（SSID为null），立即发送断开状态，无需等待网络检测
      if (this.lastSsid === null) {
        this.logger.info('WiFi已断开，立即发送断开状态');
        const disconnectedStatus = {
          connected: false,
          authenticated: false,
          wifiConnected: false,
          ssid: null,
        };
        this.window.webContents.send('event:network:statusChanged', disconnectedStatus);
        return;
      }

      // WiFi已连接，获取完整网络状态
      // 立即发送 loading 状态，让 UI 显示加载动画
      this.window.webContents.send('event:network:statusLoading', {
        loading: true,
        wifiConnected: true,
        ssid: this.lastSsid,
      });

      // 等待网络接口完全初始化
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 获取完整的网络状态
      this.logger.info('正在获取完整的网络状态信息...');
      const networkStatus = await this.networkDetector.getNetworkStatus();
      this.logger.success('网络状态获取成功', {
        wifiConnected: networkStatus.wifiConnected,
        ssid: networkStatus.ssid,
        connected: networkStatus.connected,
        authenticated: networkStatus.authenticated,
      });

      // 补齐认证判定字段（已配置 WiFi 用配置，未配置走校园网启发式）
      if (this.wifiManager && networkStatus.ssid) {
        enrichStatusAuthFields(networkStatus, this.wifiManager);
      }

      // 发送完整网络状态到渲染进程
      this.window.webContents.send('event:network:statusChanged', networkStatus);

      // WiFi 连接/切换后立即触发认证检测与自动登录（快速路径，不等心跳周期）。
      // 异步执行，避免登录重试阻塞状态推送；重入由 AutoReconnectService.isReconnecting 防护。
      if (this.autoReconnectService) {
        void this.autoReconnectService.handleStatusChange(networkStatus).catch((error) => {
          this.logger.error('认证自动重连处理失败', {
            错误: error instanceof Error ? error.message : String(error),
          });
        });
      }
    } catch (error) {
      this.logger.error('获取或发送网络状态失败', error);
    }
  }

  /**
   * 检查是否正在运行
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

/**
 * 创建 WiFi 事件监听器实例
 */
export function createWifiEventListener(options: WifiEventListenerOptions): WifiEventListener {
  return new WifiEventListener(options);
}
