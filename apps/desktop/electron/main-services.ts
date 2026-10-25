/**
 * 应用服务装配(自 main.ts 抽出):日志/存储/配置/认证/网络检测等核心服务的创建。
 */

import { app } from 'electron';
import {
  createLogger,
  createConfigManager,
  createAuthService,
  createAccountManager,
  createWifiManager,
  createNetworkDetector,
} from '@repo/shared';
import { createElectronStorage } from './services/store';
import { createDesktopWifiAdapter } from './services/wifi-adapter';
import type { AppServices } from './ipc';
import { createFileLogger, FileLogger } from './services/file-logger';
import { getResolvedAppVersion } from './utils/app-version';

/**
 * 初始化服务
 */
export async function initAppServices(): Promise<AppServices & { fileLogger: FileLogger }> {
  // 创建日志服务（保留7天，最多500条内存缓冲）
  const logger = createLogger(500, 7);

  // 文件日志：全级别、详细，落盘到 userData/logs，按大小滚动。
  // 打包后应用无终端，文件日志是排查问题的主要依据；开发态亦写盘，便于随时导出。
  const fileLogger = createFileLogger().attach(logger);

  // 控制台日志监听器：仅开发态输出，且跳过 debug 噪声，保持终端清爽。
  // 打包态无终端，不再走 console（日志已由 fileLogger 落盘 + UI 内存缓冲承接）。
  const isDev = !app.isPackaged;
  if (isDev) {
    logger.addListener((entry) => {
      // 开发态终端只关心 info 及以上，debug 归档到文件即可，不刷屏
      if (entry.level === 'debug') {
        return;
      }
      const timestamp = entry.timestamp.toLocaleTimeString('zh-CN', { hour12: false });
      const level = entry.level.toUpperCase().padEnd(7);
      const levelColors = {
        DEBUG: '\x1b[36m', // Cyan
        INFO: '\x1b[37m', // White
        SUCCESS: '\x1b[32m', // Green
        WARN: '\x1b[33m', // Yellow
        ERROR: '\x1b[31m', // Red
      };
      const color =
        levelColors[entry.level.toUpperCase() as keyof typeof levelColors] || '\x1b[37m';
      const reset = '\x1b[0m';

      let message = `${color}[${timestamp}] [${level}]${reset} ${entry.message}`;
      if (entry.data) {
        message += ` ${reset}\x1b[90m${JSON.stringify(entry.data)}\x1b[0m`;
      }
      console.log(message);
    });
  }

  logger.log('info', '===== NetMate 应用启动 =====', { category: 'system', source: 'Main' });
  logger.log('info', `运行平台: ${process.platform}`, { category: 'system', source: 'Main' });
  logger.log('info', `应用版本: ${getResolvedAppVersion()}`, {
    category: 'system',
    source: 'Main',
  });
  logger.log('info', `日志文件: ${fileLogger.getLogFile()}`, {
    category: 'system',
    source: 'Main',
  });

  // 创建存储适配器
  const storage = createElectronStorage();
  logger.log('info', '存储服务初始化完成', { category: 'system', source: 'Main' });

  // 创建配置管理器
  const configManager = createConfigManager(storage, logger);
  await configManager.load();
  const config = configManager.getConfig();
  if (config) {
    logger.log('info', '配置加载完成', {
      category: 'system',
      source: 'Main',
      data: {
        账户数量: config.accounts.length,
        WiFi配置数量: config.wifiList.length,
        心跳检测: config.settings.enableHeartbeat ? '已启用' : '已禁用',
        自动重连: config.settings.autoReconnect ? '已启用' : '已禁用',
      },
    });
  }

  // 创建其他服务
  const authService = createAuthService(undefined, logger);
  const accountManager = createAccountManager(configManager, logger);
  const wifiManager = createWifiManager(configManager, logger);
  logger.log('info', '核心服务初始化完成', { category: 'system', source: 'Main' });

  // 创建 WiFi 适配器
  const wifiAdapter = createDesktopWifiAdapter();
  const networkDetector = createNetworkDetector(wifiAdapter, logger);
  logger.log('info', '网络检测服务初始化完成', { category: 'system', source: 'Main' });

  return {
    fileLogger,
    storage,
    authService,
    configManager,
    accountManager,
    wifiManager,
    networkDetector,
    logger,
  };
}
