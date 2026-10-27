/**
 * 日志服务
 */

import {
  LogCategory,
  LogLevel,
  LogEntry,
  LogQueryOptions,
  LogPersistAdapter,
  LogOptions,
  SystemInfo,
} from '../types/log';
import { redact, redactText } from '../utils/redact';
import { generateId } from '../utils/validator';
import { formatLogLine, formatSystemInfoText } from './log-format';

/**
 * 默认最大日志条数
 */
const DEFAULT_MAX_LOGS = 1000;

/**
 * 日志保留天数（默认7天）
 */
const DEFAULT_LOG_RETENTION_DAYS = 7;

/**
 * 日志清理检查间隔（默认每小时检查一次）
 */
const LOG_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1小时

/**
 * 突发日志批量持久化窗口
 */
const PERSIST_DEBOUNCE_MS = 500;

/**
 * 日志服务类
 */
export class Logger {
  private logs: LogEntry[] = [];
  private head = 0;
  private logCount = 0;
  private maxLogs: number;
  private retentionDays: number;
  private persistAdapter: LogPersistAdapter | null = null;
  private listeners: Set<(entry: LogEntry) => void> = new Set();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPersist = false;
  private searchCache = new WeakMap<LogEntry, string>();

  constructor(
    maxLogs: number = DEFAULT_MAX_LOGS,
    retentionDays: number = DEFAULT_LOG_RETENTION_DAYS
  ) {
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
  private createEntry(
    level: LogLevel,
    message: string,
    data?: unknown,
    category?: LogCategory,
    source?: string
  ): LogEntry {
    return {
      id: generateId(),
      level,
      message: redactText(message),
      timestamp: new Date(),
      data: redact(data),
      category: category || 'general',
      source,
    };
  }

  /**
   * 添加日志。固定长度环形缓冲，写入 O(1)，满员后不再分配新数组。
   */
  private addLog(entry: LogEntry): void {
    if (this.logCount < this.maxLogs) {
      this.logs[this.logCount++] = entry;
    } else {
      this.logs[this.head] = entry;
      this.head = (this.head + 1) % this.maxLogs;
    }

    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch {
        // 忽略监听器错误
      }
    });

    if (this.persistAdapter) {
      this.schedulePersist();
    }
  }

  private schedulePersist(): void {
    this.pendingPersist = true;
    if (this.persistTimer) {
      return;
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (!this.pendingPersist || !this.persistAdapter) {
        return;
      }
      this.pendingPersist = false;
      void this.persistAdapter.save(this.getAllLogs()).catch(() => {
        // 忽略持久化错误
      });
    }, PERSIST_DEBOUNCE_MS);
  }

  /**
   * 清理过期日志（删除超过保留天数的日志）
   */
  private cleanupExpiredLogs(): void {
    const now = new Date();
    const expirationDate = new Date(now.getTime() - this.retentionDays * 24 * 60 * 60 * 1000);

    const originalCount = this.logCount;
    const kept = this.getAllLogs().filter((log) => log.timestamp >= expirationDate);
    this.logs = kept;
    this.head = 0;
    this.logCount = kept.length;
    const removedCount = originalCount - this.logCount;

    if (removedCount > 0) {
      this.info(`已清理 ${removedCount} 条过期日志（保留期: ${this.retentionDays} 天）`);
      this.schedulePersist();
    }
  }

  /**
   * 启动自动清理定时任务
   */
  private startAutoCleanup(): void {
    this.cleanupExpiredLogs();

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
   * 立即执行待持久化日志，供测试和退出路径使用。
   */
  async flushPersist(): Promise<void> {
    if (!this.persistAdapter || !this.pendingPersist) {
      return;
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.pendingPersist = false;
    await this.persistAdapter.save(this.getAllLogs()).catch(() => undefined);
  }

  /**
   * 通用日志方法（支持分类和来源）
   */
  log(level: LogLevel, message: string, options?: LogOptions): void {
    this.addLog(
      this.createEntry(level, message, options?.data, options?.category, options?.source)
    );
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
    let result = this.getAllLogs();

    if (options.level) {
      result = result.filter((log) => log.level === options.level);
    }

    if (options.category) {
      result = result.filter((log) => (log.category || 'general') === options.category);
    }

    if (options.keyword) {
      const keyword = options.keyword.toLowerCase();
      result = result.filter((log) => this.entrySearchText(log).includes(keyword));
    }

    if (options.startTime) {
      result = result.filter((log) => log.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      result = result.filter((log) => log.timestamp <= options.endTime!);
    }

    if (options.offset) {
      result = result.slice(options.offset);
    }
    if (options.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  /**
   * 获取所有日志（最新在前）
   */
  getAllLogs(): LogEntry[] {
    if (this.logCount < this.maxLogs || this.head === 0) {
      return this.logs.slice(0, this.logCount);
    }
    const newest = (this.head - 1 + this.maxLogs) % this.maxLogs;
    return [this.logs[newest], ...this.logs.slice(this.head), ...this.logs.slice(0, newest)];
  }

  private entrySearchText(entry: LogEntry): string {
    const cached = this.searchCache.get(entry);
    if (cached !== undefined) {
      return cached;
    }
    let dataText = '';
    if (entry.data !== undefined) {
      try {
        dataText = JSON.stringify(entry.data) ?? '';
      } catch {
        dataText = '';
      }
    }
    const text = `${entry.message}\n${entry.source ?? ''}\n${dataText}`.toLowerCase();
    this.searchCache.set(entry, text);
    return text;
  }

  /**
   * 获取日志数量
   */
  getLogCount(): number {
    return this.logCount;
  }

  /**
   * 清除日志
   */
  clearLogs(): void {
    this.logs = [];
    this.head = 0;
    this.logCount = 0;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.pendingPersist = false;
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
        this.logs = [];
        this.head = 0;
        this.logCount = 0;
        for (const log of logs) {
          this.addLog(log);
        }
        this.cleanupExpiredLogs();
      } catch {
        // 忽略加载错误
      }
    }
  }

  /**
   * 导出日志为文本
   */
  exportAsText(systemInfo?: SystemInfo): string {
    const lines: string[] = [];
    const separator = '='.repeat(80);

    lines.push(separator);
    lines.push('NetMate 诊断日志');
    lines.push(`导出时间: ${new Date().toISOString()}`);
    lines.push(separator);
    lines.push('');

    if (systemInfo) {
      lines.push(formatSystemInfoText(systemInfo));
      lines.push('');
    }

    const orderedLogs = this.getAllLogs();
    lines.push(`--- 日志记录 (共 ${orderedLogs.length} 条) ---`);
    orderedLogs.forEach((log) => {
      lines.push(formatLogLine(log));
    });
    lines.push(separator);

    return lines.join('\n');
  }

  /**
   * 导出日志为 JSON
   */
  exportAsJson(systemInfo?: SystemInfo): string {
    const serializableEntries = this.getAllLogs().map((log) => ({
      ...log,
      timestamp:
        log.timestamp instanceof Date ? log.timestamp.toISOString() : String(log.timestamp),
      category: log.category || 'general',
    }));

    const timeRange = {
      from:
        serializableEntries.length > 0
          ? serializableEntries[serializableEntries.length - 1].timestamp
          : '',
      to: serializableEntries.length > 0 ? serializableEntries[0].timestamp : '',
    };

    const exportData = {
      meta: {
        exportedAt: new Date().toISOString(),
        appName: 'NetMate',
        totalEntries: serializableEntries.length,
        timeRange,
      },
      ...(systemInfo ? { systemInfo } : {}),
      entries: serializableEntries,
    };

    return JSON.stringify(exportData, null, 2);
  }
}

/**
 * 创建日志服务实例
 */
export function createLogger(maxLogs?: number, retentionDays?: number): Logger {
  return new Logger(maxLogs, retentionDays);
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
