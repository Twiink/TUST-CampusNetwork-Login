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
  type NetworkStatus,
} from '@repo/shared';

import type { AutoLaunchService } from '../services/auto-launch';
import { registerAuthIPC } from './auth';
import { registerConfigIPC, type ConfigChangedHandler } from './config';
import { registerAppIPC } from './app';
import { registerAccountIPC } from './account';
import { registerWifiIPC } from './wifi';
import { registerNetworkIPC, startNetworkPolling, stopNetworkPolling } from './network';
import { registerLogIPC } from './log';
import { registerTrayIPC } from './tray';
import { registerAutoLaunchIPC } from './auto-launch';
import { registerNotificationIPC } from './notification';
import { registerUpdaterIPC } from './updater';
import { AutoReconnectService } from '../services/auto-reconnect';
import { WifiSwitcherService } from '../services/wifi-switcher';
import type { FileLogger } from '../services/file-logger';
import type { ElectronStorageAdapter } from '../services/store';

export { registerTrayIPC, registerAutoLaunchIPC, registerNotificationIPC, registerUpdaterIPC };

export { IPC_CHANNELS, IPC_EVENTS } from './channels';
export type { ConfigChangedHandler } from './config';

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
  fileLogger?: FileLogger;
  storage: ElectronStorageAdapter;
  publishNetworkStatus?: (status: NetworkStatus | 'connecting') => void;
}

/**
 * 注册所有 IPC 处理器
 */
export function registerAllIPC(
  services: AppServices,
  wifiSwitcherService?: WifiSwitcherService,
  onConfigChanged?: ConfigChangedHandler,
  autoLaunch?: AutoLaunchService,
  publishNetworkStatus = services.publishNetworkStatus
): ReturnType<typeof registerConfigIPC> {
  const { authService, configManager, accountManager, wifiManager, networkDetector, logger } =
    services;

  registerAuthIPC(
    authService,
    configManager,
    accountManager,
    logger,
    networkDetector,
    publishNetworkStatus
  );
  registerAppIPC(logger);
  const commands = registerConfigIPC(configManager, logger, onConfigChanged, autoLaunch);
  registerAccountIPC(accountManager, logger);
  registerWifiIPC(wifiManager, logger, wifiSwitcherService);
  registerNetworkIPC(networkDetector, logger, wifiManager);
  registerLogIPC(logger, services.fileLogger);

  logger.info('IPC 处理器已注册');
  return commands;
}

/**
 * 启动后台服务
 */
export function startBackgroundServices(
  services: AppServices,
  pollingInterval: number = 30000,
  autoReconnectService?: AutoReconnectService,
  enableHeartbeat: boolean = false
): void {
  startNetworkPolling(
    services.networkDetector,
    services.logger,
    pollingInterval,
    services.configManager.getSettings().autoReconnect ? autoReconnectService : undefined,
    enableHeartbeat,
    services.wifiManager,
    services.publishNetworkStatus
  );
}

/**
 * 停止后台服务
 */
export function stopBackgroundServices(services: AppServices): void {
  stopNetworkPolling(services.networkDetector, services.logger);
}
