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
} from '@repo/shared';
import { getNetworkInfo } from './network';

export interface AutoReconnectOptions {
  /** 是否启用自动重连 */
  enabled: boolean;
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始延迟 (毫秒) */
  initialDelay: number;
  /** 最大延迟 (毫秒) */
  maxDelay: number;
}

export interface AutoReconnectCallbacks {
  /** 重连开始 */
  onReconnectStart?: () => void;
  /** 重连成功 */
  onReconnectSuccess?: () => void;
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

  constructor(
    authService: AuthService,
    accountManager: AccountManager,
    logger: ReturnType<typeof createLogger>,
    options: Partial<AutoReconnectOptions> = {},
    callbacks: AutoReconnectCallbacks = {},
    wifiManager?: WifiManager
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
      ...options,
    };
    this.callbacks = callbacks;
  }

  /**
   * 处理网络状态变化
   * 在心跳检测回调中调用此方法
   */
  async handleStatusChange(status: NetworkStatus): Promise<void> {
    // 检测到从连接变为断开
    const wasConnected = this.lastStatus?.connected ?? false;
    const isDisconnected = !status.connected;

    this.logger.debug('自动重连服务：检测网络状态', {
      之前状态: wasConnected ? '已连接' : '未连接',
      当前状态: status.connected ? '已连接' : '未连接',
      WiFi连接: status.wifiConnected ? '是' : '否',
      WiFi名称: status.ssid || '无',
    });

    // 如果未启用自动重连，或者正在重连中，则跳过
    if (!this.options.enabled) {
      this.logger.debug('自动重连已禁用，跳过检测');
      this.lastStatus = status;
      return;
    }

    if (this.isReconnecting) {
      this.logger.debug('自动重连正在进行中，跳过本次检测');
      this.lastStatus = status;
      return;
    }

    // 触发重连的两种场景：
    // 1. 之前已连接，现在断开（正常掉线）
    // 2. 首次检测（lastStatus 为 null）且当前已断开（冷启动时网络不通）
    const isFirstCheck = this.lastStatus === null;
    const shouldReconnect = (wasConnected && isDisconnected) || (isFirstCheck && isDisconnected);

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

      this.logger.warn('检测到网络断开，启动自动重连', {
        触发原因: isFirstCheck ? '冷启动检测' : '连接状态变化',
        最大重试次数: this.options.maxRetries,
        初始延迟: `${this.options.initialDelay}ms`,
      });
      await this.attemptReconnect();
    }
  }

  /**
   * 尝试重连
   */
  private async attemptReconnect(): Promise<void> {
    let loginAccounts: AccountConfig[] = [];
    const currentAccount = this.accountManager.getCurrentAccount();
    if (currentAccount) {
      loginAccounts = [currentAccount];
    }

    if (this.lastStatus?.ssid && this.wifiManager) {
      const wifiConfig = this.wifiManager.getWifiBySsid(this.lastStatus.ssid);
      if (wifiConfig?.linkedAccountIds.length) {
        const linkedAccounts = wifiConfig.linkedAccountIds
          .map((accountId) => this.accountManager.getAccountById(accountId))
          .filter((account): account is AccountConfig => account !== null);

        if (linkedAccounts.length > 0) {
          this.logger.info('使用 WiFi 关联账号序列进行重连', {
            WiFi: this.lastStatus.ssid,
            关联账号数: linkedAccounts.length,
            首选账号: linkedAccounts[0].username,
          });
          loginAccounts = linkedAccounts;
        } else {
          this.logger.warn('WiFi 关联账号不存在，回退到当前账号', {
            linkedAccountIds: wifiConfig.linkedAccountIds.join(', '),
          });
        }
      }
    }

    if (loginAccounts.length === 0) {
      this.logger.warn('自动重连失败：未配置账户');
      return;
    }

    this.logger.info('===== 开始自动重连 =====', {
      账号数: loginAccounts.length,
      首选账户: loginAccounts[0].username,
      最大重试: this.options.maxRetries,
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
        this.logger.debug('获取网络信息');
        const networkInfo = getNetworkInfo();
        if (!networkInfo.ipv4) {
          this.logger.error('无法获取本机IP地址');
          throw new Error('无法获取本机 IP 地址');
        }

        this.logger.debug('准备登录配置', {
          IP: networkInfo.ipv4,
          IPv6: networkInfo.ipv6 || '无',
          MAC: networkInfo.mac || '无',
        });

        const result = await this.authService.loginWithAccounts(loginAccounts, {
          wlanUserIp: networkInfo.ipv4,
          wlanUserIpv6: networkInfo.ipv6 || undefined,
          wlanUserMac: networkInfo.mac || undefined,
        });

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

      this.logger.success('===== 自动重连成功 =====');
      this.callbacks.onReconnectSuccess?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`===== 自动重连失败 =====`, {
        总尝试次数: this.options.maxRetries + 1,
        失败原因: errorMessage,
      });
      this.callbacks.onReconnectFailed?.(error instanceof Error ? error : new Error(errorMessage));
    } finally {
      this.isReconnecting = false;
      this.logger.debug('自动重连流程结束');
    }
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
  wifiManager?: WifiManager
): AutoReconnectService {
  return new AutoReconnectService(
    authService,
    accountManager,
    logger,
    options,
    callbacks,
    wifiManager
  );
}
