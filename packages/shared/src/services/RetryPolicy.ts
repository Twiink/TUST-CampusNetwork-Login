/**
 * 重试策略服务
 */

/**
 * 重试选项
 */
export interface RetryOptions {
  /** 最大重试次数 */
  maxRetries: number;
  /** 初始延迟 (毫秒) */
  delay: number;
  /** 延迟策略 */
  backoff?: 'fixed' | 'exponential';
  /** 最大延迟 (毫秒) */
  maxDelay?: number;
  /** 重试回调 */
  onRetry?: (attempt: number, error: Error) => void;
  /** 判断是否应该重试 */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * 默认重试选项
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  delay: 1000,
  backoff: 'exponential',
  maxDelay: 30000,
};

/**
 * 重试策略类
 */
export class RetryPolicy {
  private options: RetryOptions;

  constructor(options: Partial<RetryOptions> = {}) {
    this.options = { ...DEFAULT_RETRY_OPTIONS, ...options };
  }

  /**
   * 执行带重试的异步操作
   * @param operation 要执行的异步操作
   * @param options 可选的重试选项覆盖
   * @returns 操作结果
   */
  async execute<T>(
    operation: () => Promise<T>,
    options?: Partial<RetryOptions>
  ): Promise<T> {
    const opts = { ...this.options, ...options };
    let lastError: Error = new Error('Unknown error');
    let currentDelay = opts.delay;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 如果是最后一次尝试，抛出错误
        if (attempt >= opts.maxRetries) {
          throw lastError;
        }

        // 检查是否应该重试
        if (opts.shouldRetry && !opts.shouldRetry(lastError)) {
          throw lastError;
        }

        // 调用重试回调
        if (opts.onRetry) {
          opts.onRetry(attempt + 1, lastError);
        }

        // 等待后重试
        await this.sleep(currentDelay);

        // 计算下次延迟
        if (opts.backoff === 'exponential') {
          currentDelay = Math.min(currentDelay * 2, opts.maxDelay || Infinity);
        }
      }
    }

    throw lastError;
  }

  /**
   * 更新重试选项
   */
  setOptions(options: Partial<RetryOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * 获取当前选项
   */
  getOptions(): RetryOptions {
    return { ...this.options };
  }

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 创建重试策略实例
 */
export function createRetryPolicy(options?: Partial<RetryOptions>): RetryPolicy {
  return new RetryPolicy(options);
}

/**
 * 带重试执行操作的便捷函数
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const policy = new RetryPolicy(options);
  return policy.execute(operation);
}
