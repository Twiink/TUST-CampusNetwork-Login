/**
 * 日志相关类型定义
 */

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

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
  /** 开始时间 */
  startTime?: Date;
  /** 结束时间 */
  endTime?: Date;
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
