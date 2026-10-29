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
import {
  matchWifiRule,
  type NetworkStatus,
  type NetworkDetector,
  type Logger,
  type WifiManager,
  type ConfigManager,
} from '@repo/shared';
import { enrichStatusAuthFields } from './network';
import type { AutoReconnectService } from './auto-reconnect';
import type { WifiSwitcherService } from './wifi-switcher';
import { IPC_EVENTS } from '../ipc/channels';
import {
  executeAutoReconnect,
  executeStartupAutoConnect,
  inCooldown,
} from './wifi-event-listener/reconnect-flow';
import type {
  WifiReconnectProgress,
  WifiReconnectFailure,
  WifiAllReconnectsFailed,
} from './wifi-event-listener/reconnect-flow';
import { probeCurrentSsid } from './wifi-event-listener/ssid-probe';
import * as nativeModule from '@repo/native';
import { scanAvailableNetworks } from './wifi-switcher';
import type { NotificationEventKind } from './notification';

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
  publishNetworkStatus?: (status: import('@repo/shared').NetworkStatus) => void;
  /** WiFi管理器（可选） */
  wifiManager?: WifiManager;
  /** WiFi切换服务（可选） */
  wifiSwitcherService?: WifiSwitcherService;
  /** 配置管理器（可选，用于获取maxRetries等设置） */
  configManager?: ConfigManager;
  /** 认证自动重连服务（可选）：WiFi 连接/切换后立即触发认证检测，不再等待心跳周期 */
  autoReconnectService?: AutoReconnectService;
  /** 发送分场景系统通知（由 NotificationService 按设置开关过滤） */
  notify?: (kind: NotificationEventKind, body: string) => void;
  onRecoveryProgress?: (progress: WifiReconnectProgress) => void;
}

/**
 * WiFi 事件监听器类
 */
export class WifiEventListener {
  private publishNetworkStatus?: WifiEventListenerOptions['publishNetworkStatus'];
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
  private lastIdentity: string | null = null;
  private statusGeneration = 0;
  private isRunning = false;
  private isReconnecting = false; // 防止重复重连
  private lastErrorLogged = false; // 防止错误日志过多
  private autoReconnectService?: AutoReconnectService;
  private notify?: (kind: NotificationEventKind, body: string) => void;
  private onRecoveryProgress?: WifiEventListenerOptions['onRecoveryProgress'];
  /** 最近一次「全部 WiFi 失败」的时间（冷却期起点） */
  private lastAllFailedAt = 0;
  private startupHandled = false;
  private initialCheck: Promise<void> = Promise.resolve();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSsid: string | null = null;
  private reconnectGeneration = 0;
  private recoveryDone: Promise<void> = Promise.resolve();
  private finishRecovery: (() => void) | null = null;
  private manualConnecting = false;
  private offlineStreak = 0;
  private wasOnline = false;
  private latestStatus: NetworkStatus | null = null;
  private lastWifiId: string | undefined;
  private failedList: WifiReconnectFailure[] = [];
  private authenticatedIdentity: string | null = null;
  private wifiDisabled = false;
  private async checkWifiEnabled(): Promise<boolean> {
    const enabled = await this.networkDetector.isWifiEnabled();
    if (!enabled && !this.wifiDisabled) this.cancelRecovery('系统 WiFi 已关闭');
    this.wifiDisabled = !enabled;
    return enabled;
  }
  private identity(status: NetworkStatus): string {
    return JSON.stringify([status.ssid, status.bssid, status.security, status.ip]);
  }
  private publish(status: NetworkStatus): void {
    const authenticated =
      status.authenticated || this.authenticatedIdentity === this.identity(status);
    const next = { ...status, authenticated, internetReachable: status.connected };
    this.latestStatus = next;
    if (status.wifiConnected && status.ssid)
      this.lastWifiId = matchWifiRule(
        this.wifiManager?.getWifiConfigs() ?? [],
        status as NetworkStatus & { ssid: string }
      )?.id;
    if (this.publishNetworkStatus) this.publishNetworkStatus(next);
    else if (this.window && !this.window.isDestroyed())
      this.window.webContents.send(IPC_EVENTS.NETWORK_STATUS_CHANGED, next);
  }
  private cancelRecovery(reason = '操作已取消'): void {
    this.reconnectGeneration++;
    this.cancelRetry();
    this.pendingSsid = null;
    this.broadcastReconnectProgress({
      ssid: this.lastSsid ?? '',
      attempt: 0,
      maxAttempts: 1,
      status: 'cancelled',
      reason,
    });
  }
  async retryNow(): Promise<void> {
    this.cancelRecovery();
    this.lastAllFailedAt = 0;
    await this.recoveryDone;
    await this.handleWifiDisconnect(this.lastSsid, true);
  }
  private async waitForRecovery(ms: number, current: () => Promise<boolean>): Promise<boolean> {
    for (let remaining = ms; remaining > 0; remaining -= 1000) {
      if (!(await current())) return false;
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000, remaining)));
    }
    return current();
  }
  private async handleStatus(
    status: NetworkStatus,
    trigger: 'network' | 'heartbeat'
  ): Promise<void> {
    this.publish(status);
    if (!(await this.checkWifiEnabled())) return;
    if (status.connected) {
      this.wasOnline = true;
      this.offlineStreak = 0;
      return;
    }
    if (
      !this.startupHandled ||
      this.manualConnecting ||
      this.isReconnecting ||
      !status.wifiConnected
    )
      return;
    const settings = this.configManager?.getSettings();
    if (settings?.autoReconnect === false || (settings?.autoAuthPaused && status.requiresAuth))
      return;
    if (
      this.wasOnline &&
      trigger === 'heartbeat' &&
      ++this.offlineStreak < (settings?.heartbeatFailureThreshold ?? 3)
    )
      return;
    if (this.wasOnline && status.requiresAuth) {
      this.authenticatedIdentity = null;
      this.networkDetector.rememberAuthentication?.(null);
    }
    if (status.ssid) await this.handleWifiDisconnect(status.ssid);
  }

  private cancelRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
  private scheduleRetry(delay: number): void {
    this.cancelRetry();
    if (!this.isRunning || !this.pendingSsid) return;
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = null;
        void (async () => {
          if (
            !this.isRunning ||
            !this.pendingSsid ||
            this.configManager?.getSettings().autoReconnect === false
          )
            return;
          if (!(await this.networkDetector.isWifiEnabled())) return;
          await this.handleWifiDisconnect(this.pendingSsid);
        })().catch((error) => this.logger.error('WiFi 重试失败', error));
      },
      Math.max(5000, delay)
    );
  }

  constructor(options: WifiEventListenerOptions) {
    this.publishNetworkStatus = options.publishNetworkStatus;
    this.platform = process.platform;
    this.checkInterval = options.checkInterval || 3000;
    this.networkDetector = options.networkDetector;
    this.logger = options.logger;
    this.window = options.window;
    this.wifiManager = options.wifiManager;
    this.wifiSwitcherService = options.wifiSwitcherService;
    this.configManager = options.configManager;
    this.autoReconnectService = options.autoReconnectService;
    this.notify = options.notify;
    this.onRecoveryProgress = options.onRecoveryProgress;
    if (this.wifiManager && this.wifiSwitcherService && this.configManager)
      this.autoReconnectService?.setRecoveryHandler?.((status, trigger) =>
        this.handleStatus(status, trigger)
      );
    this.wifiSwitcherService?.setRetryHandler?.(() => this.retryNow());
    this.wifiSwitcherService?.setManualConnectionHandler?.(() => {
      this.manualConnecting = true;
      this.cancelRecovery();
      return () => {
        this.manualConnecting = false;
        void this.checkWifiChange(true);
      };
    });
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
    this.initialCheck = this.checkWifiChange().catch((error) => {
      this.logger.error('初始 WiFi 状态检测失败', error);
    });
    this.initialCheck
      .then(() => this.handleStartupAutoConnect())
      .catch((error) => {
        this.logger.error('启动自动连接失败', error);
      });

    // 原生事件驱动优先（nl80211 组播 / WlanRegisterNotification / CoreWLAN diff）
    const nativeWatchSupported = this.startNativeWatch();

    // 原生事件承担实时性；兜底轮询只做状态一致性校验，降到 30s。
    this.restartTimer();

    this.logger.info(
      `WiFi 事件监听器已启动，原生事件: ${nativeWatchSupported ? '已启用' : '不可用'}，兜底间隔: ${
        this.nativeWatchStarted ? 30_000 : this.checkInterval
      }ms`
    );
  }

  /** 初次状态推送已完成；后续自动连接独立执行。 */
  whenInitialized(): Promise<void> {
    return this.initialCheck;
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
          this.checkWifiChange(true).catch((error) => {
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
    this.cancelRecovery('自动恢复服务已停止');
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
    if (this.isRunning) {
      this.restartTimer();
    }
  }

  private restartTimer(): void {
    const existingTimer = this.timer;
    if (existingTimer) {
      clearInterval(existingTimer);
      this.timer = null;
    }
    if (!this.isRunning) return;
    const interval = this.nativeWatchStarted ? 30_000 : this.checkInterval;
    this.timer = setInterval(async () => {
      try {
        await this.checkWifiChange();
      } catch (error) {
        this.logger.error('WiFi 状态检测失败', error);
      }
    }, interval);
    if (existingTimer) {
      this.logger.info(`WiFi 检测间隔已调整为: ${interval}ms`);
    }
  }

  /**
   * 检测 WiFi 状态变化
   */
  private async checkWifiChange(force = false): Promise<void> {
    try {
      if (force) this.networkDetector.invalidateCache?.();
      // 使用轻量级方法快速获取当前 SSID
      const currentSsid = await probeCurrentSsid(this.platform, this.logger);
      const snapshot = await this.networkDetector.getWifiSnapshot?.();
      if (this.wifiManager && this.wifiSwitcherService) await this.checkWifiEnabled();
      const identity = snapshot
        ? JSON.stringify([snapshot.ssid, snapshot.bssid, snapshot.security, snapshot.ipv4])
        : currentSsid;
      const identityChanged = identity !== this.lastIdentity;
      if (identityChanged) {
        this.lastIdentity = identity;
        this.statusGeneration++;
        this.networkDetector.invalidateCache?.();
        this.autoReconnectService?.invalidateNetwork?.();
      }

      // 重置错误标志（成功获取到SSID）
      if (this.lastErrorLogged) {
        this.lastErrorLogged = false;
        this.logger.info('WiFi 状态检测已恢复正常');
      }

      // 检测 SSID 是否发生变化
      if (currentSsid !== this.lastSsid) {
        if (currentSsid && !this.isReconnecting) {
          this.cancelRetry();
          this.pendingSsid = null;
        }
        const prevSsid = this.lastSsid;
        this.lastSsid = currentSsid;
        this.networkDetector.invalidateCache?.();
        this.autoReconnectService?.invalidateNetwork?.();

        // 记录变化
        if (prevSsid === null && currentSsid) {
          this.logger.info(`WiFi 已连接: ${currentSsid}`);
        } else if (prevSsid && currentSsid === null) {
          this.logger.info(`WiFi 已断开: ${prevSsid}`);
          this.notify?.('wifiDisconnected', `已断开 ${prevSsid}`);

          // 先取消认证并派发断网，再等待物理重连。
          await this.notifyNetworkStatusChange();
          await this.handleWifiDisconnect(prevSsid);
          return;
        } else if (prevSsid && currentSsid) {
          this.logger.info(`WiFi 已切换: ${prevSsid} → ${currentSsid}`);
        }

        // 触发网络状态更新
        await this.notifyNetworkStatusChange();
      } else if ((force || identityChanged) && currentSsid) {
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
  private async handleWifiDisconnect(
    disconnectedSsid: string | null,
    explicit = false
  ): Promise<void> {
    // 如果正在重连或没有配置WiFi管理器和切换服务，则跳过
    if (
      this.isReconnecting ||
      this.manualConnecting ||
      !this.wifiManager ||
      !this.wifiSwitcherService
    ) {
      return;
    }
    if (!explicit && this.retryTimer) return;
    this.pendingSsid = disconnectedSsid;
    const settings = this.configManager?.getConfig()?.settings;
    // 「断线自动重连」关闭时不重连 WiFi（与 Android 端一致）
    if (!explicit && settings && !settings.autoReconnect) {
      this.logger.debug('断线自动重连已关闭，跳过 WiFi 重连');
      return;
    }
    const cooldownMinutes = settings?.wifiReconnectCooldownMinutes ?? 0;
    if (inCooldown(this.lastAllFailedAt, cooldownMinutes * 60_000, Date.now())) {
      this.logger.info(`WiFi 重连处于冷却期（${cooldownMinutes} 分钟），跳过`);
      return;
    }

    this.isReconnecting = true;
    this.recoveryDone = new Promise((resolve) => {
      this.finishRecovery = resolve;
    });
    const generation = this.reconnectGeneration;
    try {
      const result = await executeAutoReconnect(
        disconnectedSsid,
        this.reconnectDeps(false, explicit)
      );
      if (generation !== this.reconnectGeneration) return;
      this.recordReconnectResult(result, cooldownMinutes);
    } finally {
      this.isReconnecting = false;
      this.finishRecovery?.();
      this.finishRecovery = null;
      if (generation !== this.reconnectGeneration && this.isRunning && !this.manualConnecting)
        void this.checkWifiChange(true);
      if (generation === this.reconnectGeneration && !(await this.networkDetector.isWifiEnabled()))
        this.cancelRecovery('系统 WiFi 已关闭');
      this.logger.info(`===== WiFi自动重连流程结束 =====`);
    }
    return;
  }

  /**
   * 启动时自动连接（只执行一次）
   */
  private async handleStartupAutoConnect(): Promise<void> {
    if (this.startupHandled || !this.wifiManager || !this.wifiSwitcherService) {
      return;
    }
    this.startupHandled = true;
    if (this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;
    this.recoveryDone = new Promise((resolve) => {
      this.finishRecovery = resolve;
    });
    const generation = this.reconnectGeneration;
    try {
      const result = await executeStartupAutoConnect(this.lastSsid, {
        ...this.reconnectDeps(true),
        scanAvailableSsids: async () => (await scanAvailableNetworks()).map((n) => n.ssid),
      });
      if (generation !== this.reconnectGeneration) return;
      this.recordReconnectResult(
        result,
        this.configManager?.getConfig()?.settings.wifiReconnectCooldownMinutes ?? 0
      );
    } finally {
      this.isReconnecting = false;
      this.finishRecovery?.();
      this.finishRecovery = null;
    }
    if (this.latestStatus && !this.latestStatus.connected)
      void this.handleStatus(this.latestStatus, 'network');
  }

  private reconnectDeps(startup = false, explicit = false) {
    const generation = this.reconnectGeneration;
    const revision = this.configManager?.getConfig()?.revision;
    const current = async () =>
      this.isRunning &&
      !this.manualConnecting &&
      generation === this.reconnectGeneration &&
      revision === this.configManager?.getConfig()?.revision &&
      (explicit ||
        (startup
          ? this.configManager?.getSettings().startupAutoConnect !== false
          : this.configManager?.getSettings().autoReconnect !== false)) &&
      (await this.networkDetector.isWifiEnabled());
    const configs = this.wifiManager!.getWifiConfigs();
    const currentRule = this.latestStatus?.ssid
      ? matchWifiRule(configs, this.latestStatus as NetworkStatus & { ssid: string })
      : null;
    const candidates = configs.filter((w) => w.autoConnect);
    if (currentRule && !currentRule.autoConnect && this.latestStatus?.wifiConnected)
      candidates.unshift(currentRule);
    if (this.latestStatus?.wifiConnected && this.latestStatus.ssid && !currentRule) {
      candidates.unshift({
        id: 'current-network',
        ssid: this.latestStatus.ssid,
        password: '',
        security: this.latestStatus.security,
        bssid: this.latestStatus.bssid,
        autoConnect: true,
        requiresAuth: this.latestStatus.requiresAuth ?? false,
        linkedAccountIds: [],
        priority: 0,
        lastConnectedAt: null,
      });
    }
    return {
      shouldContinue: current,
      candidates,
      currentWifiId:
        currentRule?.id ??
        (this.latestStatus?.wifiConnected
          ? candidates[0]?.id === 'current-network'
            ? 'current-network'
            : undefined
          : this.lastWifiId),
      connect: async (wifi: import('@repo/shared').WifiConfig) => {
        const snapshot = await this.networkDetector.getNetworkStatus({ fresh: true });
        if (
          snapshot.wifiConnected &&
          matchWifiRule([wifi], snapshot as NetworkStatus & { ssid: string })
        )
          return true;
        if (!wifi.autoConnect) return false;
        return this.wifiSwitcherService!.connectToConfiguredNetwork(wifi.id, current);
      },
      verify: async (
        wifi: import('@repo/shared').WifiConfig,
        phase: (status: 'authenticating' | 'verifying') => void
      ) => {
        let status = await this.networkDetector.getNetworkStatus({ fresh: true });
        for (
          let elapsed = 0;
          status.wifiConnected && !status.ip && elapsed < 15_000;
          elapsed += 1000
        ) {
          if (!(await this.waitForRecovery(1000, current)))
            return { online: false, authenticated: false, reason: '操作已取消' };
          status = await this.networkDetector.getNetworkStatus({ fresh: true });
        }
        if (!(await current()))
          return { online: false, authenticated: false, reason: '操作已取消' };
        enrichStatusAuthFields(status, this.wifiManager!);
        if (status.requiresAuth && this.configManager?.getSettings().autoAuthPaused) {
          this.cancelRecovery();
          return { online: false, authenticated: false, reason: '自动认证已暂停' };
        }
        let authenticated =
          status.authenticated || this.authenticatedIdentity === this.identity(status);
        let authFailure: string | undefined;
        if (
          !status.connected &&
          status.requiresAuth &&
          !authenticated &&
          !this.configManager?.getSettings().autoAuthPaused
        ) {
          phase('authenticating');
          const result = await this.autoReconnectService?.authenticateOnce(status, current);
          authenticated = result?.success ?? false;
          if (!authenticated) authFailure = result?.message;
          if (authenticated && (await current()))
            this.authenticatedIdentity = this.identity(status);
        }
        const threshold =
          status.requiresAuth && !authenticated
            ? 1
            : (this.configManager?.getSettings().heartbeatFailureThreshold ?? 3);
        phase('verifying');
        for (let check = 0; check < threshold; check++) {
          if (!(await current())) return { online: false, authenticated, reason: '操作已取消' };
          if (
            check > 0 &&
            !(await this.waitForRecovery(
              (this.configManager?.getSettings().heartbeatIntervalSeconds ?? 30) * 1000,
              current
            ))
          )
            return { online: false, authenticated, reason: '操作已取消' };
          if (!(await current())) return { online: false, authenticated, reason: '操作已取消' };
          status = await this.networkDetector.getNetworkStatus({ fresh: true });
          if (!(await current())) return { online: false, authenticated, reason: '操作已取消' };
          if (
            !status.wifiConnected ||
            !matchWifiRule([wifi], status as NetworkStatus & { ssid: string })
          )
            return { online: false, authenticated: false, reason: '系统未连接目标 WiFi' };
          this.publish({ ...status, authenticated });
          if (status.connected) return { online: true, authenticated };
        }
        return {
          online: false,
          authenticated,
          retryable: !!status.requiresAuth && !authenticated,
          reason: authenticated ? '已认证但互联网不可达' : (authFailure ?? '互联网不可达'),
        };
      },
      logger: this.logger,
      wifiManager: this.wifiManager!,
      wifiSwitcherService: this.wifiSwitcherService!,
      configManager: this.configManager,
      onProgress: (progress: WifiReconnectProgress) => {
        if (generation === this.reconnectGeneration) this.broadcastReconnectProgress(progress);
      },
      onAllFailed: (failedList: WifiReconnectFailure[]) => {
        this.failedList = failedList;
        this.broadcastReconnectProgress({
          ssid: failedList[0]?.ssid ?? '',
          status: 'failed',
          attempt: 0,
          maxAttempts: 1,
          failedList,
        });
        this.broadcastAllWifiFailed(failedList);
        const names = failedList.map((f) => f.ssid).join('、');
        this.notify?.('reconnectFailed', `已尝试 ${names}，均未连上`);
      },
      onReconnected: async (ssid: string) => {
        if (!(await current())) return;
        this.notify?.('reconnectSuccess', `网络已恢复：${ssid}`);
        if (this.wasOnline && this.latestStatus?.requiresAuth)
          this.notify?.('authRecovered', '校园网认证与联网已恢复');
        this.wasOnline = true;
        this.offlineStreak = 0;
      },
    };
  }

  private recordReconnectResult(result: boolean | null, cooldownMinutes: number): void {
    if (result === true) {
      this.lastAllFailedAt = 0;
      this.cancelRetry();
      this.pendingSsid = null;
    } else if (result === false) {
      this.lastAllFailedAt = Date.now();
      this.pendingSsid ??=
        this.wifiManager?.getWifiConfigs().find((wifi) => wifi.autoConnect)?.ssid ?? null;
      if (this.configManager?.getSettings().autoReconnect !== false) {
        const delay = Math.max(5000, cooldownMinutes * 60_000);
        this.broadcastReconnectProgress({
          ssid: this.pendingSsid ?? '',
          status: 'cooldown',
          attempt: 0,
          maxAttempts: 1,
          nextRetryAt: Date.now() + delay,
          failedList: this.failedList,
        });
        this.scheduleRetry(delay);
      }
      if (cooldownMinutes > 0) {
        this.logger.info(`WiFi 自动重连全部失败，${cooldownMinutes} 分钟内不再尝试`);
      }
    }
  }

  /**
   * 配置变化后清除冷却期，新 WiFi/新密码可以立即尝试
   */
  resetCooldown(): void {
    if (this.configManager?.getSettings().autoAuthPaused) this.authenticatedIdentity = null;
    const pending = this.pendingSsid ?? this.lastSsid;
    this.cancelRecovery(
      this.configManager?.getSettings().autoReconnect ? '配置已更新' : '断线自动重连已关闭'
    );
    this.lastAllFailedAt = 0;
    if (this.configManager?.getSettings().autoReconnect && pending) {
      this.pendingSsid = pending;
      this.scheduleRetry(5000);
    }
  }

  /**
   * 广播WiFi重连进度到UI
   */
  private broadcastReconnectProgress(progress: WifiReconnectProgress): void {
    this.onRecoveryProgress?.(progress);
    this.wifiSwitcherService?.setRecoveryProgress?.(progress);
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
    const expectedSsid = this.lastSsid;
    const generation = this.statusGeneration;
    try {
      const send = (event: string, payload: unknown) => {
        if (this.window && !this.window.isDestroyed()) this.window.webContents.send(event, payload);
      };
      // 如果WiFi已断开（SSID为null），立即发送断开状态，无需等待网络检测
      if (this.lastSsid === null) {
        this.logger.info('WiFi已断开，立即发送断开状态');
        const disconnectedStatus = {
          connected: false,
          authenticated: false,
          wifiConnected: false,
          ssid: undefined,
        };
        void this.autoReconnectService
          ?.handleStatusChange(disconnectedStatus as never, 'network')
          .catch((error) => this.logger.error('认证断网处理失败', error));
        if (this.publishNetworkStatus) this.publishNetworkStatus(disconnectedStatus);
        else send('event:network:statusChanged', disconnectedStatus);
        return;
      }

      // WiFi已连接，获取完整网络状态
      // 立即发送 loading 状态，让 UI 显示加载动画
      send('event:network:statusLoading', {
        loading: true,
        wifiConnected: true,
        ssid: this.lastSsid,
      });

      // 获取完整的网络状态
      this.logger.info('正在获取完整的网络状态信息...');
      const networkStatus = await this.networkDetector.getNetworkStatus({ fresh: true });
      if (
        !this.isRunning ||
        generation !== this.statusGeneration ||
        this.lastSsid !== expectedSsid ||
        networkStatus.ssid !== expectedSsid
      )
        return;
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

      this.publish(networkStatus);

      // WiFi 连接/切换后立即触发认证检测与自动登录（快速路径，不等心跳周期）。
      // 异步执行，避免登录重试阻塞状态推送；重入由 AutoReconnectService.isReconnecting 防护。
      if (this.autoReconnectService) {
        void this.autoReconnectService
          .handleStatusChange(networkStatus, 'network')
          .catch((error) => {
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
