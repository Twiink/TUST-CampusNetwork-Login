/**
 * WiFi 三阶段自动重连编排（自 WifiEventListener 抽出）：
 * 1. 单 WiFi 重试（N 次）→ 2. 按优先级切换 → 3. 全部失败广播失败列表。
 * 通过 deps 注入日志/管理器与 UI 广播回调，不持有轮询状态。
 */

import type { Logger, WifiManager, ConfigManager } from '@repo/shared';
import type { WifiSwitcherService } from '../wifi-switcher';

/**
 * WiFi 重连进度事件
 */
export interface WifiReconnectProgress {
  ssid: string;
  attempt: number;
  maxAttempts: number;
  status: 'connecting' | 'failed' | 'success';
}

/**
 * WiFi 重连失败信息
 */
export interface WifiReconnectFailure {
  ssid: string;
  priority: number;
  reason: string;
}

/**
 * 所有 WiFi 重连失败事件
 */
export interface WifiAllReconnectsFailed {
  failedList: WifiReconnectFailure[];
}

export interface AutoReconnectDeps {
  logger: Logger;
  wifiManager: WifiManager;
  wifiSwitcherService: WifiSwitcherService;
  configManager?: ConfigManager;
  onProgress: (progress: WifiReconnectProgress) => void;
  onAllFailed: (failedList: WifiReconnectFailure[]) => void;
  onReconnected: () => Promise<void>;
}

export async function executeAutoReconnect(
  disconnectedSsid: string,
  deps: AutoReconnectDeps
): Promise<void> {
  const { logger, wifiManager, configManager, onAllFailed, onReconnected } = deps;

  const wifiConfig = wifiManager.getWifiBySsid(disconnectedSsid);
  if (!wifiConfig || !wifiConfig.autoConnect) {
    logger.debug(`WiFi ${disconnectedSsid} 未配置自动重连，跳过`);
    return;
  }

  logger.info(`===== 开始WiFi自动重连流程 =====`);
  logger.info(`断开的WiFi: ${disconnectedSsid} (优先级: ${wifiConfig.priority})`);

  const maxRetries = configManager?.getConfig()?.settings.maxRetries || 3;
  logger.info(`最大重试次数: ${maxRetries}`);

  logger.info('等待WiFi硬件重置...');
  await sleep(2000);

  const allWifiConfigs = wifiManager
    .getWifiConfigs()
    .filter((w: { autoConnect: boolean }) => w.autoConnect)
    .sort((a: { priority: number }, b: { priority: number }) => a.priority - b.priority);

  const failedList: WifiReconnectFailure[] = [];

  try {
    logger.info(`----- 阶段1：尝试重连到断开的WiFi -----`);
    const reconnectSuccess = await retryConnectToWifi(
      disconnectedSsid,
      wifiConfig.priority,
      maxRetries,
      failedList,
      deps
    );

    if (reconnectSuccess) {
      logger.success(`WiFi自动重连成功: ${disconnectedSsid}`);
      await onReconnected();
      return;
    }

    logger.info(`----- 阶段2：按优先级尝试其他WiFi -----`);
    for (const wifi of allWifiConfigs) {
      if (wifi.ssid === disconnectedSsid) {
        continue;
      }

      logger.info(`切换到下一个WiFi: ${wifi.ssid} (优先级: ${wifi.priority})`);
      await sleep(1000);

      const success = await retryConnectToWifi(
        wifi.ssid,
        wifi.priority,
        maxRetries,
        failedList,
        deps
      );

      if (success) {
        logger.success(`成功切换到WiFi: ${wifi.ssid}`);
        await onReconnected();
        return;
      }
    }

    logger.error(`----- 阶段3：所有WiFi连接失败 -----`);
    logger.error(`失败的WiFi数量: ${failedList.length}`);
    for (const failed of failedList) {
      logger.error(`  - ${failed.ssid} (优先级 ${failed.priority}): ${failed.reason}`);
    }

    onAllFailed(failedList);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`WiFi自动重连流程异常: ${errorMessage}`);
  }
}

async function retryConnectToWifi(
  ssid: string,
  priority: number,
  maxRetries: number,
  failedList: WifiReconnectFailure[],
  deps: AutoReconnectDeps
): Promise<boolean> {
  const { logger, wifiSwitcherService, onProgress } = deps;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    logger.info(`尝试连接 ${ssid} (第 ${attempt}/${maxRetries} 次)`);
    onProgress({ ssid, attempt, maxAttempts: maxRetries, status: 'connecting' });

    try {
      if (attempt > 1) {
        await sleep(2000);
      }

      const success = await wifiSwitcherService.connectToConfiguredNetwork(ssid);

      if (success) {
        logger.success(`连接成功: ${ssid} (第 ${attempt}/${maxRetries} 次)`);
        onProgress({ ssid, attempt, maxAttempts: maxRetries, status: 'success' });
        return true;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`连接失败: ${ssid} (第 ${attempt}/${maxRetries} 次) - ${errorMessage}`);

      if (attempt === maxRetries) {
        onProgress({ ssid, attempt, maxAttempts: maxRetries, status: 'failed' });
        failedList.push({ ssid, priority, reason: errorMessage || '连接超时' });
      }
    }
  }

  if (!failedList.some((f) => f.ssid === ssid)) {
    onProgress({ ssid, attempt: maxRetries, maxAttempts: maxRetries, status: 'failed' });
    failedList.push({ ssid, priority, reason: '连接超时' });
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
