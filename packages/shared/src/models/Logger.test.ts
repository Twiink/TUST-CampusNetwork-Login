import { afterEach, describe, expect, it } from 'vitest';
import { Logger } from './Logger';

const createdLoggers: Logger[] = [];

function createTestLogger(maxLogs = 500, retentionDays = 7) {
  const logger = new Logger(maxLogs, retentionDays);
  createdLoggers.push(logger);
  return logger;
}

describe('Logger', () => {
  afterEach(() => {
    createdLoggers.splice(0).forEach((logger) => logger.stopAutoCleanup());
  });

  it('应限制最大日志条数并保留最新日志', () => {
    const logger = createTestLogger(2);

    logger.info('第一条');
    logger.warn('第二条');
    logger.error('第三条');

    expect(logger.getLogCount()).toBe(2);
    expect(logger.getAllLogs().map((entry) => entry.message)).toEqual(['第三条', '第二条']);
  });

  it('应清理超过保留期的日志并支持文本与 JSON 导出', () => {
    const logger = createTestLogger(10, 7);

    logger.info('有效日志');

    const internalLogger = logger as unknown as {
      logs: Array<{
        id: string;
        level: 'debug' | 'info' | 'warn' | 'error' | 'success';
        message: string;
        timestamp: Date;
      }>;
      cleanupExpiredLogs: () => void;
    };

    internalLogger.logs.push({
      id: 'expired-log',
      level: 'info',
      message: '过期日志',
      timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });

    internalLogger.cleanupExpiredLogs();

    expect(logger.getAllLogs().map((entry) => entry.message)).not.toContain('过期日志');
    expect(logger.exportAsText()).toContain('有效日志');
    expect(JSON.parse(logger.exportAsJson())).toHaveLength(logger.getLogCount());
  });
});
