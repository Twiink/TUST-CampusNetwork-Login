/**
 * 日志相关类型定义
 */

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

/**
 * 日志分类
 */
export type LogCategory = 'system' | 'auth' | 'network' | 'wifi' | 'user' | 'request' | 'general';

/**
 * 日志条目
 */
export interface LogEntry {
  /** 日志唯一标识 */
  id: string;
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息 */
  message: string;
  /** 时间戳 */
  timestamp: Date;
  /** 附加数据 */
  data?: unknown;
  /** 日志分类 */
  category?: LogCategory;
  /** 来源标识，如 'AuthService'、'Main' */
  source?: string;
}

/**
 * 日志记录选项（用于带分类的日志写入）
 */
export interface LogOptions {
  /** 日志分类 */
  category?: LogCategory;
  /** 来源标识 */
  source?: string;
  /** 附加数据 */
  data?: unknown;
}

/**
 * 日志查询选项
 */
export interface LogQueryOptions {
  /** 最大条数 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
  /** 日志级别过滤 */
  level?: LogLevel;
  /** 日志分类过滤 */
  category?: LogCategory;
  /** 关键词搜索 */
  keyword?: string;
  /** 开始时间 */
  startTime?: Date;
  /** 结束时间 */
  endTime?: Date;
}

/**
 * 系统信息（导出时采集）
 */
export interface SystemInfo {
  os: { platform: string; release: string; arch: string };
  app: { version: string; electronVersion: string; nodeVersion: string; chromeVersion: string };
  hardware: { cpuModel: string; cpuCores: number; totalMemoryMB: number; freeMemoryMB: number };
  network: { interface?: string; ipv4?: string; mac?: string; wifiSSID?: string };
  collectedAt: string;
}

/**
 * 日志导出数据包
 */
export interface LogExportData {
  meta: {
    exportedAt: string;
    appName: string;
    totalEntries: number;
    timeRange: { from: string; to: string };
  };
  systemInfo?: SystemInfo;
  entries: LogEntry[];
}

/**
 * 日志持久化适配器接口
 */
export interface LogPersistAdapter {
  /** 保存日志 */
  save(logs: LogEntry[]): Promise<void>;
  /** 加载日志 */
  load(): Promise<LogEntry[]>;
  /** 清除日志 */
  clear(): Promise<void>;
}
