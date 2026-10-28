/**
 * 自动重连服务
 * 在网络断开时自动尝试重新登录
 */

import {
  AuthService,
  AccountManager,
  WifiManager,
  NetworkStatus,
  createRetryPolicy,
  createLogger,
  AccountConfig,
  resolveLoginAccounts,
  type ConfigManager,
} from '@repo/shared';
import { resolveNetworkInfo } from './network';

export interface AutoReconnectOptions {
  /** 是否启用自动重连 */
  enabled: boolean;
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始延迟 (毫秒) */
  initialDelay: number;
  /** 最大延迟 (毫秒) */
  maxDelay: number;
  /**
   * 连续失败阈值（settings.heartbeatFailureThreshold）：
   * 已确认在线后，心跳连续检测到离线达到该次数才重新认证，避免网络抖动触发重登
   */
  failureThreshold: number;
}

/**
 * 状态检测来源：
 * - heartbeat：定时心跳，受连续失败阈值约束
 * - network：WiFi 连接/切换事件，视为确定需要检查，不受阈值限制
 */
export type StatusTrigger = 'heartbeat' | 'network';

export interface AutoReconnectCallbacks {
  /** 重连开始 */
  onReconnectStart?: () => void;
  /** 重连成功；recovered 表示此前已在线、掉线后重新认证成功（「认证恢复」） */
  onReconnectSuccess?: (info: { recovered: boolean }) => void;
  /** 重连失败 */
  onReconnectFailed?: (error: Error) => void;
  /** 重连尝试 */
  onReconnectAttempt?: (attempt: number, maxAttempts: number) => void;
}

/**
 * 自动重连服务类
 */
export class AutoReconnectService {
  private authService: AuthService;
  private accountManager: AccountManager;
  private wifiManager: WifiManager | null;
  private logger: ReturnType<typeof createLogger>;
  private options: AutoReconnectOptions;
  private callbacks: AutoReconnectCallbacks;
  private lastStatus: NetworkStatus | null = null;
  private isReconnecting = false;
  private networkGeneration = 0;
  /** 当前 WiFi 曾确认在线；用于连续失败阈值与「认证恢复」判定 */
  private wasOnline = false;
  /** 已在线后连续检测到离线的次数 */
  private offlineStreak = 0;
  /** 本次连接是否因掉线触发过认证 */
  private lostAuthentication = false;

  constructor(
    authService: AuthService,
    accountManager: AccountManager,
    logger: ReturnType<typeof createLogger>,
    options: Partial<AutoReconnectOptions> = {},
    callbacks: AutoReconnectCallbacks = {},
    wifiManager?: WifiManager,
    private configManager?: ConfigManager
  ) {
    this.authService = authService;
    this.accountManager = accountManager;
    this.wifiManager = wifiManager || null;
    this.logger = logger;
    this.options = {
      enabled: true,
      maxRetries: 3,
      initialDelay: 2000,
      maxDelay: 30000,
      failureThreshold: 3,
      ...options,
    };
    this.callbacks = callbacks;
  }

  /**
   * 处理网络状态变化
   * 在心跳检测回调中调用此方法
   */
  async handleStatusChange(
    status: NetworkStatus,
    trigger: StatusTrigger = 'heartbeat'
  ): Promise<void> {
    if (
      ['ssid', 'bssid', 'ip', 'wifiConnected'].some(
        (key) =>
          status[key as keyof NetworkStatus] !== this.lastStatus?.[key as keyof NetworkStatus]
      )
    )
      this.networkGeneration++;
    // 换了 WiFi 或断开 WiFi：在线记录只对同一连接有效
    if (!status.wifiConnected || status.ssid !== this.lastStatus?.ssid) {
      this.resetConnectionState();
    }
    if (status.connected) {
      this.wasOnline = true;
      this.offlineStreak = 0;
    }

    // 检测到从连接变为断开
    const wasConnected = this.lastStatus?.connected ?? false;
    const isDisconnected = !status.connected;

    this.logger.debug('自动重连服务：检测网络状态', {
      之前状态: wasConnected ? '已连接' : '未连接',
      当前状态: status.connected ? '已连接' : '未连接',
      WiFi连接: status.wifiConnected ? '是' : '否',
      WiFi名称: status.ssid || '无',
      需认证: status.requiresAuth ? '是' : '否',
    });

    // 如果未启用自动重连，或者正在重连中，则跳过
    if (!this.options.enabled || this.configManager?.getSettings().autoAuthPaused) {
      this.logger.debug('自动重连已禁用，跳过检测');
      this.lastStatus = status;
      return;
    }

    if (this.isReconnecting) {
      this.logger.debug('自动重连正在进行中，跳过本次检测');
      this.lastStatus = status;
      return;
    }

    // 触发重连的场景（对齐参考实现的「需要登录就登」自愈语义）：
    // 1. 之前已连接，现在断开（正常掉线/认证过期）
    // 2. 首次检测（lastStatus 为 null）且当前已断开（冷启动时网络不通）
    // 3. 状态驱动自愈：当前 WiFi 需要认证且未联网——不依赖状态跳变，
    //    每个检测周期检查一次，首轮失败（如 IP 未就绪）后仍会自动补登
    const isFirstCheck = this.lastStatus === null;
    const edgeTriggered = (wasConnected && isDisconnected) || (isFirstCheck && isDisconnected);
    const selfHealing = status.requiresAuth && isDisconnected;
    const shouldReconnect = edgeTriggered || selfHealing;

    this.lastStatus = status;

    if (shouldReconnect) {
      // 需求 §2.4.4：校园网认证断线重连仅针对需要认证的 WiFi
      // 若当前 WiFi 不需要认证（家庭WiFi、手机热点），跳过认证重连
      if (!status.requiresAuth) {
        this.logger.debug('当前 WiFi 无需校园网认证，跳过认证重连', {
          ssid: status.ssid || '未知',
        });
        return;
      }

      // 无可用账号时静默跳过（自愈路径每个周期都会经过，避免日志刷屏）
      const hasAccount =
        this.accountManager.getCurrentAccount() !== null ||
        (status.ssid
          ? (this.wifiManager?.getWifiBySsid(status.ssid)?.linkedAccountIds.length ?? 0) > 0
          : false);
      if (!hasAccount) {
        this.logger.debug('未配置认证账号，跳过自动重连', {
          ssid: status.ssid || '未知',
        });
        return;
      }

      // 连续失败阈值：已在线后心跳偶发探测失败不立即重新认证；WiFi 事件触发不受限制
      if (this.wasOnline && trigger === 'heartbeat') {
        this.offlineStreak += 1;
        const threshold = Math.max(1, this.options.failureThreshold);
        if (this.offlineStreak < threshold) {
          this.logger.debug(`检测失败 ${this.offlineStreak}/${threshold}，暂不重新认证`);
          return;
        }
      }
      if (this.wasOnline) {
        this.lostAuthentication = true;
      }

      this.logger.log('warn', '检测到网络断开，启动自动重连', {
        category: 'network',
        source: 'AutoReconnect',
        data: {
          触发原因: edgeTriggered ? (isFirstCheck ? '冷启动检测' : '连接状态变化') : '状态驱动自愈',
          最大重试次数: this.options.maxRetries,
          初始延迟: `${this.options.initialDelay}ms`,
        },
      });
      await this.attemptReconnect();
    }
  }

  /**
   * 尝试重连
   */
  private async attemptReconnect(): Promise<void> {
    const generation = this.networkGeneration;
    const config = this.configManager?.getConfig();
    const current = () =>
      generation === this.networkGeneration &&
      this.options.enabled &&
      !this.configManager?.getSettings().autoAuthPaused &&
      (this.configManager?.getConfig()?.revision ?? 0) === (config?.revision ?? 0);
    let loginAccounts: AccountConfig[] = config
      ? resolveLoginAccounts(
          config,
          this.lastStatus?.ssid ? (this.lastStatus as NetworkStatus & { ssid: string }) : null
        )
      : [];
    if (!config) {
      const linked = this.lastStatus?.ssid
        ? (this.wifiManager?.getWifiBySsid(this.lastStatus.ssid)?.linkedAccountIds ?? [])
        : [];
      loginAccounts = linked
        .map((id) => this.accountManager.getAccountById(id))
        .filter((a): a is AccountConfig => !!a);
      if (!loginAccounts.length) {
        const current = this.accountManager.getCurrentAccount();
        if (current) loginAccounts = [current];
      }
    }

    if (loginAccounts.length === 0) {
      this.logger.warn('自动重连失败：未配置账户');
      return;
    }

    this.logger.log('info', '===== 开始自动重连 =====', {
      category: 'network',
      source: 'AutoReconnect',
      data: {
        账号数: loginAccounts.length,
        首选账户: loginAccounts[0].username,
        最大重试: this.options.maxRetries,
      },
    });

    this.isReconnecting = true;
    this.callbacks.onReconnectStart?.();

    const retryPolicy = createRetryPolicy({
      maxRetries: this.options.maxRetries,
      delay: this.options.initialDelay,
      backoff: 'exponential',
      maxDelay: this.options.maxDelay,
      onRetry: (attempt, error) => {
        this.logger.info(`自动重连第 ${attempt} 次尝试`, {
          失败原因: error.message,
          最大尝试: this.options.maxRetries,
        });
        this.callbacks.onReconnectAttempt?.(attempt, this.options.maxRetries);
      },
    });

    try {
      await retryPolicy.execute(async () => {
        if (!current()) return { success: false, cancelled: true };
        this.logger.debug('获取网络信息');
        const networkInfo = await resolveNetworkInfo();
        if (!networkInfo.ipv4) {
          this.logger.error('无法获取本机IP地址');
          throw new Error('无法获取本机 IP 地址');
        }

        if (!current()) return { success: false, cancelled: true };
        this.logger.debug('准备登录配置', {
          IP: networkInfo.ipv4,
          IPv6: networkInfo.ipv6 || '无',
          MAC: networkInfo.mac || '无',
        });

        const result = await this.authService.runExclusive(() =>
          this.authService.loginWithAccounts(
            loginAccounts,
            {
              wlanUserIp: networkInfo.ipv4!,
              wlanUserIpv6: networkInfo.ipv6 || undefined,
              wlanUserMac: networkInfo.mac || undefined,
            },
            {
              shouldContinue: current,
            }
          )
        );

        if (!current() || result.cancelled) return { ...result, cancelled: true };
        if (!result.success) {
          this.logger.warn('登录请求失败', { 消息: result.message });
          throw new Error(result.message);
        }

        this.logger.success('登录请求成功', {
          消息: result.message,
          账户ID: result.accountId || '未知',
          尝试次数: result.attempts.length,
        });
        return result;
      });

      if (!current()) return;
      this.logger.log('success', '===== 自动重连成功 =====', {
        category: 'network',
        source: 'AutoReconnect',
      });
      const recovered = this.lostAuthentication;
      this.lostAuthentication = false;
      this.wasOnline = true;
      this.offlineStreak = 0;
      this.callbacks.onReconnectSuccess?.({ recovered });
    } catch (error) {
      if (!current()) return;
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.logger.log('error', `===== 自动重连失败 =====`, {
        category: 'network',
        source: 'AutoReconnect',
        data: {
          总尝试次数: this.options.maxRetries + 1,
          失败原因: errorMessage,
        },
      });
      this.callbacks.onReconnectFailed?.(error instanceof Error ? error : new Error(errorMessage));
    } finally {
      this.isReconnecting = false;
      this.logger.debug('自动重连流程结束');
    }
  }

  private resetConnectionState(): void {
    this.wasOnline = false;
    this.offlineStreak = 0;
    this.lostAuthentication = false;
  }

  /**
   * 手动触发重连
   */
  async triggerReconnect(): Promise<boolean> {
    this.logger.info('手动触发自动重连');

    if (this.isReconnecting) {
      this.logger.warn('重连正在进行中，无法手动触发');
      return false;
    }

    await this.attemptReconnect();
    return true;
  }

  /**
   * 更新配置
   */
  setOptions(options: Partial<AutoReconnectOptions>): void {
    const oldOptions = { ...this.options };
    this.options = { ...this.options, ...options };

    this.logger.info('自动重连配置已更新', {
      启用状态: this.options.enabled ? '已启用' : '已禁用',
      最大重试: this.options.maxRetries,
      初始延迟: `${this.options.initialDelay}ms`,
      最大延迟: `${this.options.maxDelay}ms`,
      连续失败阈值: this.options.failureThreshold,
    });

    // 如果启用状态发生变化，记录特别日志
    if (oldOptions.enabled !== this.options.enabled) {
      if (this.options.enabled) {
        this.logger.success('自动重连已启用');
      } else {
        this.logger.warn('自动重连已禁用');
      }
    }
  }

  /**
   * 更新回调
   */
  setCallbacks(callbacks: AutoReconnectCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * 获取是否正在重连
   */
  isReconnectInProgress(): boolean {
    return this.isReconnecting;
  }

  /**
   * 获取当前配置
   */
  getOptions(): AutoReconnectOptions {
    return { ...this.options };
  }
}

/**
 * 创建自动重连服务实例
 */
export function createAutoReconnectService(
  authService: AuthService,
  accountManager: AccountManager,
  logger: ReturnType<typeof createLogger>,
  options?: Partial<AutoReconnectOptions>,
  callbacks?: AutoReconnectCallbacks,
  wifiManager?: WifiManager,
  configManager?: ConfigManager
): AutoReconnectService {
  return new AutoReconnectService(
    authService,
    accountManager,
    logger,
    options,
    callbacks,
    wifiManager,
    configManager
  );
}
