/**
 * 自动重连服务
 * 在网络断开时自动尝试重新登录
 */

import {
  AuthService,
  AccountManager,
  NetworkStatus,
  createRetryPolicy,
  createLogger,
  LoginConfig,
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
    callbacks: AutoReconnectCallbacks = {}
  ) {
    this.authService = authService;
    this.accountManager = accountManager;
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

    this.lastStatus = status;

    // 如果未启用自动重连，或者正在重连中，则跳过
    if (!this.options.enabled || this.isReconnecting) {
      return;
    }

    // 如果之前是连接状态，现在断开了，触发重连
    if (wasConnected && isDisconnected) {
      this.logger.warn('检测到网络断开，启动自动重连');
      await this.attemptReconnect();
    }
  }

  /**
   * 尝试重连
   */
  private async attemptReconnect(): Promise<void> {
    const currentAccount = this.accountManager.getCurrentAccount();
    if (!currentAccount) {
      this.logger.warn('自动重连失败：未配置账户');
      return;
    }

    this.isReconnecting = true;
    this.callbacks.onReconnectStart?.();

    const retryPolicy = createRetryPolicy({
      maxRetries: this.options.maxRetries,
      delay: this.options.initialDelay,
      backoff: 'exponential',
      maxDelay: this.options.maxDelay,
      onRetry: (attempt, error) => {
        this.logger.info(`自动重连第 ${attempt} 次尝试 (原因: ${error.message})`);
        this.callbacks.onReconnectAttempt?.(attempt, this.options.maxRetries);
      },
    });

    try {
      await retryPolicy.execute(async () => {
        const networkInfo = getNetworkInfo();
        if (!networkInfo.ipv4) {
          throw new Error('无法获取本机 IP 地址');
        }

        const loginConfig: LoginConfig = {
          serverUrl: currentAccount.serverUrl,
          userAccount: currentAccount.username,
          userPassword: currentAccount.password,
          wlanUserIp: networkInfo.ipv4,
          wlanUserIpv6: networkInfo.ipv6 || undefined,
          wlanUserMac: networkInfo.mac || undefined,
          isp: currentAccount.isp,
        };

        this.authService.setServerUrl(currentAccount.serverUrl);
        const result = await this.authService.login(loginConfig);

        if (!result.success) {
          throw new Error(result.message);
        }

        return result;
      });

      this.logger.success('自动重连成功');
      this.callbacks.onReconnectSuccess?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.logger.error(`自动重连失败 (已尝试 ${this.options.maxRetries + 1} 次): ${errorMessage}`);
      this.callbacks.onReconnectFailed?.(error instanceof Error ? error : new Error(errorMessage));
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * 手动触发重连
   */
  async triggerReconnect(): Promise<boolean> {
    if (this.isReconnecting) {
      this.logger.warn('重连正在进行中');
      return false;
    }

    await this.attemptReconnect();
    return true;
  }

  /**
   * 更新配置
   */
  setOptions(options: Partial<AutoReconnectOptions>): void {
    this.options = { ...this.options, ...options };
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
  callbacks?: AutoReconnectCallbacks
): AutoReconnectService {
  return new AutoReconnectService(authService, accountManager, logger, options, callbacks);
}
