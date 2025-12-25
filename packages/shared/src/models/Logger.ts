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
 * 日志服务类
 */
export class Logger {
  private logs: LogEntry[] = [];
  private maxLogs: number;
  private persistAdapter: LogPersistAdapter | null = null;
  private listeners: Set<(entry: LogEntry) => void> = new Set();

  constructor(maxLogs: number = DEFAULT_MAX_LOGS) {
    this.maxLogs = maxLogs;
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
    this.listeners.forEach(listener => {
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
    const data = error instanceof Error
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
      result = result.filter(log => log.level === options.level);
    }

    // 按时间范围过滤
    if (options.startTime) {
      result = result.filter(log => log.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      result = result.filter(log => log.timestamp <= options.endTime!);
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
      .map(log => {
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
