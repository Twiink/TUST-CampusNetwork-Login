/**
 * 日志服务
 */

import { LogLevel, LogEntry, LogQueryOptions, LogPersistAdapter } from '../types/log';
import { generateId } from '../utils/validator';

/**
 * 默认最大日志条数
 */
const DEFAULT_MAX_LOGS = 500;

/**
 * 日志保留天数（默认7天）
 */
const DEFAULT_LOG_RETENTION_DAYS = 7;

/**
 * 日志清理检查间隔（默认每小时检查一次）
 */
const LOG_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1小时

/**
 * 日志服务类
 */
export class Logger {
  private logs: LogEntry[] = [];
  private maxLogs: number;
  private retentionDays: number;
  private persistAdapter: LogPersistAdapter | null = null;
  private listeners: Set<(entry: LogEntry) => void> = new Set();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(maxLogs: number = DEFAULT_MAX_LOGS, retentionDays: number = DEFAULT_LOG_RETENTION_DAYS) {
    this.maxLogs = maxLogs;
    this.retentionDays = retentionDays;
    this.startAutoCleanup();
  }

  /**
   * 设置持久化适配器
   */
  setPersistAdapter(adapter: LogPersistAdapter): void {
    this.persistAdapter = adapter;
  }

  /**
   * 添加日志监听器
   */
  addListener(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 创建日志条目
   */
  private createEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
    return {
      id: generateId(),
      level,
      message,
      timestamp: new Date(),
      data,
    };
  }

  /**
   * 添加日志
   */
  private addLog(entry: LogEntry): void {
    this.logs.unshift(entry);

    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // 通知监听器
    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch {
        // 忽略监听器错误
      }
    });

    // 异步持久化
    if (this.persistAdapter) {
      this.persistAdapter.save(this.logs).catch(() => {
        // 忽略持久化错误
      });
    }
  }

  /**
   * 清理过期日志（删除超过保留天数的日志）
   */
  private cleanupExpiredLogs(): void {
    const now = new Date();
    const expirationDate = new Date(now.getTime() - this.retentionDays * 24 * 60 * 60 * 1000);

    const originalCount = this.logs.length;
    this.logs = this.logs.filter((log) => log.timestamp >= expirationDate);
    const removedCount = originalCount - this.logs.length;

    if (removedCount > 0) {
      this.info(`已清理 ${removedCount} 条过期日志（保留期: ${this.retentionDays} 天）`);

      // 持久化清理后的日志
      if (this.persistAdapter) {
        this.persistAdapter.save(this.logs).catch(() => {
          // 忽略持久化错误
        });
      }
    }
  }

  /**
   * 启动自动清理定时任务
   */
  private startAutoCleanup(): void {
    // 立即执行一次清理
    this.cleanupExpiredLogs();

    // 设置定时清理
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredLogs();
    }, LOG_CLEANUP_INTERVAL);
  }

  /**
   * 停止自动清理定时任务
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 调试日志
   */
  debug(message: string, data?: unknown): void {
    this.addLog(this.createEntry('debug', message, data));
  }

  /**
   * 信息日志
   */
  info(message: string, data?: unknown): void {
    this.addLog(this.createEntry('info', message, data));
  }

  /**
   * 警告日志
   */
  warn(message: string, data?: unknown): void {
    this.addLog(this.createEntry('warn', message, data));
  }

  /**
   * 错误日志
   */
  error(message: string, error?: Error | unknown): void {
    const data =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error;
    this.addLog(this.createEntry('error', message, data));
  }

  /**
   * 成功日志
   */
  success(message: string, data?: unknown): void {
    this.addLog(this.createEntry('success', message, data));
  }

  /**
   * 获取日志列表
   */
  getLogs(options: LogQueryOptions = {}): LogEntry[] {
    let result = [...this.logs];

    // 按级别过滤
    if (options.level) {
      result = result.filter((log) => log.level === options.level);
    }

    // 按时间范围过滤
    if (options.startTime) {
      result = result.filter((log) => log.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      result = result.filter((log) => log.timestamp <= options.endTime!);
    }

    // 分页
    if (options.offset) {
      result = result.slice(options.offset);
    }
    if (options.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  /**
   * 获取所有日志
   */
  getAllLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * 获取日志数量
   */
  getLogCount(): number {
    return this.logs.length;
  }

  /**
   * 清除日志
   */
  clearLogs(): void {
    this.logs = [];
    if (this.persistAdapter) {
      this.persistAdapter.clear().catch(() => {
        // 忽略持久化错误
      });
    }
  }

  /**
   * 从持久化存储加载日志
   */
  async loadFromPersist(): Promise<void> {
    if (this.persistAdapter) {
      try {
        const logs = await this.persistAdapter.load();
        this.logs = logs;
        // 加载后立即清理过期日志
        this.cleanupExpiredLogs();
      } catch {
        // 忽略加载错误
      }
    }
  }

  /**
   * 导出日志为文本
   */
  exportAsText(): string {
    return this.logs
      .map((log) => {
        const timestamp = log.timestamp.toISOString();
        const level = log.level.toUpperCase().padEnd(7);
        const data = log.data ? ` | ${JSON.stringify(log.data)}` : '';
        return `[${timestamp}] [${level}] ${log.message}${data}`;
      })
      .join('\n');
  }

  /**
   * 导出日志为 JSON
   */
  exportAsJson(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

/**
 * 创建日志服务实例
 */
export function createLogger(maxLogs?: number): Logger {
  return new Logger(maxLogs);
}

/**
 * 全局日志实例
 */
let globalLogger: Logger | null = null;

/**
 * 获取全局日志实例
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

/**
 * 设置全局日志实例
 */
export function setLogger(logger: Logger): void {
  globalLogger = logger;
}
