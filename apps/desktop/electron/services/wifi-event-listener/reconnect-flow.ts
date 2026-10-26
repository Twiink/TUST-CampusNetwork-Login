/**
 * WiFi 三阶段自动重连编排（自 WifiEventListener 抽出）：
 * 1. 单 WiFi 重试（settings.wifiReconnectRetries 次）→ 2. 按优先级切换 → 3. 全部失败广播失败列表。
 * 通过 deps 注入日志/管理器与 UI 广播回调，不持有轮询状态（冷却期由调用方维护）。
 *
 * 语义与 Android 端 WifiReconnector / WifiReconnectPolicy 保持一致。
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
  onReconnected: (ssid: string) => Promise<void>;
  /** 首次连接前的等待（毫秒）；启动自动连接无需等待硬件重置 */
  initialDelayMs?: number;
}

/** 单个 WiFi 重试次数：读新字段，兼容旧 maxRetries，至少 1 次 */
export function resolveRetriesPerWifi(configManager?: ConfigManager): number {
  const settings = configManager?.getConfig()?.settings;
  const value = settings?.wifiReconnectRetries ?? settings?.maxRetries ?? 3;
  return Math.max(1, Math.floor(value));
}

/** 冷却期判定：冷却时长为 0 表示不冷却 */
export function inCooldown(lastAllFailedAt: number, cooldownMs: number, now: number): boolean {
  return cooldownMs > 0 && lastAllFailedAt > 0 && now - lastAllFailedAt < cooldownMs;
}

/**
 * 重连顺序：断开的 WiFi 排第一，其余开启自动连接的 WiFi 按优先级（数字越小越优先）
 */
export function planReconnect<T extends { ssid: string; priority: number }>(
  disconnectedSsid: string | null,
  candidates: T[]
): T[] {
  const sorted = [...candidates].sort((a, b) => a.priority - b.priority);
  if (!disconnectedSsid) return sorted;
  const first = sorted.find((c) => c.ssid === disconnectedSsid);
  return first ? [first, ...sorted.filter((c) => c.ssid !== disconnectedSsid)] : sorted;
}

/**
 * 执行三阶段重连
 * @param disconnectedSsid 刚断开的 WiFi；启动自动连接时为 null（直接按优先级尝试）
 * @returns 是否已连上某个 WiFi；未执行（未开启自动连接/无候选）返回 null
 */
export async function executeAutoReconnect(
  disconnectedSsid: string | null,
  deps: AutoReconnectDeps
): Promise<boolean | null> {
  const { logger, wifiManager, configManager, onAllFailed, onReconnected } = deps;

  const candidates = wifiManager.getWifiConfigs().filter((w) => w.autoConnect);
  if (disconnectedSsid !== null && !candidates.some((w) => w.ssid === disconnectedSsid)) {
    logger.debug(`WiFi ${disconnectedSsid} 未配置自动重连，跳过`);
    return null;
  }
  const plan = planReconnect(disconnectedSsid, candidates);
  if (plan.length === 0) {
    return null;
  }

  // 设置页整份保存配置时不会同步切换服务的网络列表，这里以最新配置为准
  deps.wifiSwitcherService.setConfiguredNetworks(
    wifiManager.getWifiConfigs().map((w) => ({
      ssid: w.ssid,
      password: w.password,
      priority: w.priority || 10,
    }))
  );

  const maxRetries = resolveRetriesPerWifi(configManager);
  logger.info(`===== 开始WiFi自动重连流程 =====`);
  logger.info(
    `${disconnectedSsid ? `断开的WiFi: ${disconnectedSsid}` : '启动自动连接'}，候选 ${plan.length} 个，单个 WiFi 重试 ${maxRetries} 次`
  );

  const initialDelayMs = deps.initialDelayMs ?? 2000;
  if (initialDelayMs > 0) {
    logger.info('等待WiFi硬件重置...');
    await sleep(initialDelayMs);
  }

  const failedList: WifiReconnectFailure[] = [];

  try {
    for (const [index, wifi] of plan.entries()) {
      if (index === 0 && disconnectedSsid) {
        logger.info(`----- 阶段1：尝试重连到断开的WiFi -----`);
      } else {
        if (index === (disconnectedSsid ? 1 : 0)) {
          logger.info(`----- 阶段2：按优先级尝试其他WiFi -----`);
        }
        logger.info(`切换到下一个WiFi: ${wifi.ssid} (优先级: ${wifi.priority})`);
        if (index > 0) await sleep(1000);
      }

      const success = await retryConnectToWifi(
        wifi.ssid,
        wifi.priority,
        maxRetries,
        failedList,
        deps
      );
      if (success) {
        logger.success(`WiFi自动连接成功: ${wifi.ssid}`);
        await onReconnected(wifi.ssid);
        return true;
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
  return false;
}

export interface StartupConnectDeps extends AutoReconnectDeps {
  /** 扫描当前可见的 SSID 列表 */
  scanAvailableSsids: () => Promise<string[]>;
}

/**
 * 启动时自动连接（settings.startupAutoConnect，语义对齐 Android AutoAuthEngine.onStartup）：
 * - 未连接 WiFi：按优先级三阶段尝试已开启自动连接的 WiFi
 * - 已连接已配置的 WiFi：不动
 * - 已连接未配置的 WiFi：「保持当前连接」开启则不动；关闭则切换到可见的最高优先级已配置 WiFi
 *
 * @returns 是否执行了连接动作并成功；未执行返回 null
 */
export async function executeStartupAutoConnect(
  currentSsid: string | null,
  deps: StartupConnectDeps
): Promise<boolean | null> {
  const { logger, wifiManager, wifiSwitcherService, configManager } = deps;
  const settings = configManager?.getConfig()?.settings;
  if (!settings?.startupAutoConnect) {
    return null;
  }

  if (currentSsid === null) {
    logger.info('启动时未连接 WiFi，开始自动连接');
    return executeAutoReconnect(null, { ...deps, initialDelayMs: 0 });
  }

  const candidates = wifiManager.getWifiConfigs().filter((w) => w.autoConnect);
  const configured = candidates.some((w) => w.ssid === currentSsid);
  if (settings.keepCurrentConnection || configured) {
    logger.debug(`启动时已连接 ${currentSsid}，保持当前连接`);
    return null;
  }

  const visible = new Set(await deps.scanAvailableSsids());
  const best = planReconnect(null, candidates).find((w) => visible.has(w.ssid));
  if (!best) {
    logger.info('附近没有已配置的 WiFi，保持当前连接');
    return null;
  }

  logger.info(`启动时切换 WiFi: ${currentSsid} → ${best.ssid}`);
  wifiSwitcherService.setConfiguredNetworks(
    wifiManager.getWifiConfigs().map((w) => ({
      ssid: w.ssid,
      password: w.password,
      priority: w.priority || 10,
    }))
  );
  try {
    const success = await wifiSwitcherService.connectToConfiguredNetwork(best.ssid);
    if (success) {
      await deps.onReconnected(best.ssid);
    }
    return success;
  } catch (error) {
    logger.warn(`启动切换 WiFi 失败: ${error instanceof Error ? error.message : String(error)}`);
    return false;
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
