/**
 * IPC 处理器注册入口
 */

import {
  AuthService,
  ConfigManager,
  AccountManager,
  WifiManager,
  NetworkDetector,
  Logger,
} from '@repo/shared';

import { registerAuthIPC } from './auth';
import { registerConfigIPC } from './config';
import { registerAccountIPC } from './account';
import { registerWifiIPC } from './wifi';
import { registerNetworkIPC, startNetworkPolling, stopNetworkPolling } from './network';
import { registerLogIPC } from './log';
import { registerTrayIPC } from './tray';
import { registerAutoLaunchIPC } from './auto-launch';
import { registerNotificationIPC } from './notification';
import { registerUpdaterIPC } from './updater';
import { AutoReconnectService } from '../services/auto-reconnect';

export { registerTrayIPC, registerAutoLaunchIPC, registerNotificationIPC, registerUpdaterIPC };

export { IPC_CHANNELS, IPC_EVENTS } from './channels';

/**
 * 服务集合
 */
export interface AppServices {
  authService: AuthService;
  configManager: ConfigManager;
  accountManager: AccountManager;
  wifiManager: WifiManager;
  networkDetector: NetworkDetector;
  logger: Logger;
}

/**
 * 注册所有 IPC 处理器
 */
export function registerAllIPC(services: AppServices): void {
  const {
    authService,
    configManager,
    accountManager,
    wifiManager,
    networkDetector,
    logger,
  } = services;

  registerAuthIPC(authService, configManager, accountManager, logger);
  registerConfigIPC(configManager, logger);
  registerAccountIPC(accountManager, logger);
  registerWifiIPC(wifiManager, logger);
  registerNetworkIPC(networkDetector, logger);
  registerLogIPC(logger);

  logger.info('IPC 处理器已注册');
}

/**
 * 启动后台服务
 */
export function startBackgroundServices(
  services: AppServices,
  pollingInterval: number = 30000,
  autoReconnectService?: AutoReconnectService
): void {
  startNetworkPolling(services.networkDetector, services.logger, pollingInterval, autoReconnectService);
}

/**
 * 停止后台服务
 */
export function stopBackgroundServices(services: AppServices): void {
  stopNetworkPolling(services.networkDetector, services.logger);
}
