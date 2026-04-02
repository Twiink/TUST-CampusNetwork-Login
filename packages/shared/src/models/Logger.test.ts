import { afterEach, describe, expect, it } from 'vitest';
import { Logger } from './Logger';
import type { SystemInfo } from '../types/log';

const createdLoggers: Logger[] = [];

function createTestLogger(maxLogs = 1000, retentionDays = 7) {
  const logger = new Logger(maxLogs, retentionDays);
  createdLoggers.push(logger);
  return logger;
}

const mockSystemInfo: SystemInfo = {
  os: { platform: 'darwin', release: '25.3.0', arch: 'arm64' },
  app: { version: '1.0.0', electronVersion: '32.0.0', nodeVersion: '20.18.0', chromeVersion: '128.0.0' },
  hardware: { cpuModel: 'Apple M2', cpuCores: 8, totalMemoryMB: 16384, freeMemoryMB: 8192 },
  network: { interface: 'en0', ipv4: '10.0.0.1', mac: 'AA:BB:CC:DD:EE:FF', wifiSSID: 'TUST-Student' },
  collectedAt: '2026-04-02T12:00:00.000Z',
};

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

  it('应清理超过保留期的日志', () => {
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
  });

  describe('log() 方法', () => {
    it('应支持带分类和来源的日志写入', () => {
      const logger = createTestLogger();

      logger.log('info', '登录成功', {
        category: 'auth',
        source: 'AuthService',
        data: { userId: '123' },
      });

      const logs = logger.getAllLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('info');
      expect(logs[0].message).toBe('登录成功');
      expect(logs[0].category).toBe('auth');
      expect(logs[0].source).toBe('AuthService');
      expect(logs[0].data).toEqual({ userId: '123' });
    });

    it('未指定分类时默认为 general', () => {
      const logger = createTestLogger();

      logger.log('warn', '测试消息');

      const logs = logger.getAllLogs();
      expect(logs[0].category).toBe('general');
      expect(logs[0].source).toBeUndefined();
    });

    it('现有 info/error 等方法应默认 category 为 general', () => {
      const logger = createTestLogger();

      logger.info('信息');
      logger.error('错误');

      const logs = logger.getAllLogs();
      expect(logs[0].category).toBe('general');
      expect(logs[1].category).toBe('general');
    });
  });

  describe('getLogs() 过滤', () => {
    it('应按 category 过滤', () => {
      const logger = createTestLogger();

      logger.log('info', '系统启动', { category: 'system' });
      logger.log('info', '登录请求', { category: 'auth' });
      logger.log('warn', '网络断开', { category: 'network' });

      const authLogs = logger.getLogs({ category: 'auth' });
      expect(authLogs).toHaveLength(1);
      expect(authLogs[0].message).toBe('登录请求');
    });

    it('应按 keyword 搜索消息和数据', () => {
      const logger = createTestLogger();

      logger.log('info', '用户登录成功', { data: { userId: 'abc' } });
      logger.log('error', 'WiFi 断开', { data: { ssid: 'TUST' } });
      logger.info('普通消息');

      const results = logger.getLogs({ keyword: 'TUST' });
      expect(results).toHaveLength(1);
      expect(results[0].message).toBe('WiFi 断开');
    });

    it('关键词搜索应不区分大小写', () => {
      const logger = createTestLogger();

      logger.info('WiFi Connected');
      logger.info('其他消息');

      const results = logger.getLogs({ keyword: 'wifi' });
      expect(results).toHaveLength(1);
    });

    it('应按 keyword 搜索 source 字段', () => {
      const logger = createTestLogger();

      logger.log('info', '消息1', { source: 'AuthService' });
      logger.log('info', '消息2', { source: 'Main' });

      const results = logger.getLogs({ keyword: 'authservice' });
      expect(results).toHaveLength(1);
      expect(results[0].message).toBe('消息1');
    });

    it('应支持 category + level 组合过滤', () => {
      const logger = createTestLogger();

      logger.log('info', 'auth info', { category: 'auth' });
      logger.log('error', 'auth error', { category: 'auth' });
      logger.log('error', 'network error', { category: 'network' });

      const results = logger.getLogs({ category: 'auth', level: 'error' });
      expect(results).toHaveLength(1);
      expect(results[0].message).toBe('auth error');
    });
  });

  describe('exportAsText()', () => {
    it('不传 systemInfo 时应输出基本格式', () => {
      const logger = createTestLogger();
      logger.info('测试消息');

      const text = logger.exportAsText();

      expect(text).toContain('NetMate 诊断日志');
      expect(text).toContain('导出时间:');
      expect(text).toContain('日志记录 (共 1 条)');
      expect(text).toContain('测试消息');
      expect(text).not.toContain('系统信息');
    });

    it('传入 systemInfo 时应包含系统信息段', () => {
      const logger = createTestLogger();
      logger.info('测试');

      const text = logger.exportAsText(mockSystemInfo);

      expect(text).toContain('--- 系统信息 ---');
      expect(text).toContain('darwin 25.3.0 (arm64)');
      expect(text).toContain('1.0.0');
      expect(text).toContain('Apple M2 (8核)');
      expect(text).toContain('16384MB 总计');
      expect(text).toContain('TUST-Student');
    });

    it('日志行应包含分类和来源', () => {
      const logger = createTestLogger();
      logger.log('error', '登录失败', {
        category: 'auth',
        source: 'AuthService',
        data: { code: 401 },
      });

      const text = logger.exportAsText();

      expect(text).toContain('[ERROR  ]');
      expect(text).toContain('[auth    ]');
      expect(text).toContain('[AuthService]');
      expect(text).toContain('登录失败');
      expect(text).toContain('"code":401');
    });
  });

  describe('exportAsJson()', () => {
    it('不传 systemInfo 时应返回 LogExportData 结构（无 systemInfo 字段）', () => {
      const logger = createTestLogger();
      logger.info('测试');

      const data = JSON.parse(logger.exportAsJson());

      expect(data.meta).toBeDefined();
      expect(data.meta.appName).toBe('NetMate');
      expect(data.meta.totalEntries).toBe(1);
      expect(data.meta.exportedAt).toBeDefined();
      expect(data.meta.timeRange).toBeDefined();
      expect(data.systemInfo).toBeUndefined();
      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].message).toBe('测试');
      expect(data.entries[0].category).toBe('general');
    });

    it('传入 systemInfo 时应包含 systemInfo 字段', () => {
      const logger = createTestLogger();
      logger.info('测试');

      const data = JSON.parse(logger.exportAsJson(mockSystemInfo));

      expect(data.systemInfo).toBeDefined();
      expect(data.systemInfo.os.platform).toBe('darwin');
      expect(data.systemInfo.hardware.cpuModel).toBe('Apple M2');
    });

    it('entries 中的 timestamp 应为 ISO 字符串', () => {
      const logger = createTestLogger();
      logger.info('测试');

      const data = JSON.parse(logger.exportAsJson());

      expect(typeof data.entries[0].timestamp).toBe('string');
      expect(data.entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('entries 中应包含 category 和 source', () => {
      const logger = createTestLogger();
      logger.log('info', '测试', { category: 'auth', source: 'AuthService' });

      const data = JSON.parse(logger.exportAsJson());

      expect(data.entries[0].category).toBe('auth');
      expect(data.entries[0].source).toBe('AuthService');
    });
  });
});
