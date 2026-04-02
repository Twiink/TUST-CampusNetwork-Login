/**
 * 日志服务
 */

import {
  LogLevel,
  LogEntry,
  LogQueryOptions,
  LogPersistAdapter,
  LogOptions,
  LogCategory,
  SystemInfo,
} from '../types/log';
import { generateId } from '../utils/validator';

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
 * 日志服务类
 */
export class Logger {
  private logs: LogEntry[] = [];
  private maxLogs: number;
  private retentionDays: number;
  private persistAdapter: LogPersistAdapter | null = null;
  private listeners: Set<(entry: LogEntry) => void> = new Set();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

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
      message,
      timestamp: new Date(),
      data,
      category: category || 'general',
      source,
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
    let result = [...this.logs];

    // 按级别过滤
    if (options.level) {
      result = result.filter((log) => log.level === options.level);
    }

    // 按分类过滤
    if (options.category) {
      result = result.filter((log) => (log.category || 'general') === options.category);
    }

    // 按关键词搜索
    if (options.keyword) {
      const keyword = options.keyword.toLowerCase();
      result = result.filter((log) => {
        if (log.message.toLowerCase().includes(keyword)) return true;
        if (log.source && log.source.toLowerCase().includes(keyword)) return true;
        if (log.data) {
          try {
            return JSON.stringify(log.data).toLowerCase().includes(keyword);
          } catch {
            return false;
          }
        }
        return false;
      });
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
   * 格式化系统信息为文本
   */
  private formatSystemInfoText(systemInfo: SystemInfo): string {
    const lines: string[] = [];
    lines.push('--- 系统信息 ---');
    lines.push(
      `操作系统: ${systemInfo.os.platform} ${systemInfo.os.release} (${systemInfo.os.arch})`
    );
    lines.push(`应用版本: ${systemInfo.app.version}`);
    lines.push(
      `Electron: ${systemInfo.app.electronVersion} | Node: ${systemInfo.app.nodeVersion} | Chrome: ${systemInfo.app.chromeVersion}`
    );
    lines.push(
      `CPU: ${systemInfo.hardware.cpuModel} (${systemInfo.hardware.cpuCores}核)`
    );
    lines.push(
      `内存: ${systemInfo.hardware.totalMemoryMB}MB 总计 / ${systemInfo.hardware.freeMemoryMB}MB 可用`
    );

    const netParts: string[] = [];
    if (systemInfo.network.interface) netParts.push(systemInfo.network.interface);
    if (systemInfo.network.ipv4) netParts.push(`IPv4: ${systemInfo.network.ipv4}`);
    if (systemInfo.network.mac) netParts.push(`MAC: ${systemInfo.network.mac}`);
    if (systemInfo.network.wifiSSID) netParts.push(`WiFi: ${systemInfo.network.wifiSSID}`);
    if (netParts.length > 0) {
      lines.push(`网络: ${netParts.join(' | ')}`);
    }

    return lines.join('\n');
  }

  /**
   * 格式化单条日志为文本行
   */
  private formatLogLine(log: LogEntry): string {
    const timestamp =
      log.timestamp instanceof Date ? log.timestamp.toISOString() : String(log.timestamp);
    const level = log.level.toUpperCase().padEnd(7);
    const category = (log.category || 'general').padEnd(8);
    const source = log.source ? `[${log.source}] ` : '';
    const data = log.data ? ` | ${JSON.stringify(log.data)}` : '';
    return `[${timestamp}] [${level}] [${category}] ${source}${log.message}${data}`;
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
      lines.push(this.formatSystemInfoText(systemInfo));
      lines.push('');
    }

    lines.push(`--- 日志记录 (共 ${this.logs.length} 条) ---`);
    this.logs.forEach((log) => {
      lines.push(this.formatLogLine(log));
    });
    lines.push(separator);

    return lines.join('\n');
  }

  /**
   * 导出日志为 JSON
   */
  exportAsJson(systemInfo?: SystemInfo): string {
    const serializableEntries = this.logs.map((log) => ({
      ...log,
      timestamp: log.timestamp instanceof Date ? log.timestamp.toISOString() : String(log.timestamp),
      category: log.category || 'general',
    }));

    const timeRange = {
      from: serializableEntries.length > 0 ? serializableEntries[serializableEntries.length - 1].timestamp : '',
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
