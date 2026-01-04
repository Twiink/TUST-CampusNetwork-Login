/**
 * 网络相关 IPC 处理
 */

import { ipcMain, BrowserWindow } from 'electron';
import { NetworkDetector, NetworkStatus, createLogger } from '@repo/shared';
import { getNetworkInfo, getCurrentWifiSSID, getFullNetworkInfo } from '../services/network';
import { AutoReconnectService } from '../services/auto-reconnect';
import { IPC_CHANNELS, IPC_EVENTS } from './channels';

// 心跳检测倒计时定时器
let heartbeatCountdownTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatIntervalMs = 30000;
let nextHeartbeatTime = 0;
let lastNetworkStatus: NetworkStatus | null = null;

/**
 * 注册网络 IPC 处理器
 */
export function registerNetworkIPC(
  networkDetector: NetworkDetector,
  logger: ReturnType<typeof createLogger>
) {
  /**
   * 获取网络状态
   */
  ipcMain.handle(IPC_CHANNELS.NETWORK_STATUS, async (): Promise<NetworkStatus> => {
    try {
      const status = await networkDetector.getNetworkStatus();
      return status;
    } catch (error) {
      logger.error('IPC错误：获取网络状态失败', {
        错误: error instanceof Error ? error.message : String(error),
      });
      return { connected: false, authenticated: false, wifiConnected: false };
    }
  });

  /**
   * 获取网络信息 (IP/MAC)
   */
  ipcMain.handle(IPC_CHANNELS.NETWORK_INFO, async () => {
    const info = getNetworkInfo();
    return info;
  });

  /**
   * 检查网络连通性
   */
  ipcMain.handle(IPC_CHANNELS.NETWORK_CHECK, async (): Promise<boolean> => {
    try {
      const connected = await networkDetector.checkConnectivity();
      return connected;
    } catch (error) {
      logger.error('IPC错误：检查网络连通性失败', {
        错误: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  });

  /**
   * 获取当前 WiFi SSID
   */
  ipcMain.handle(IPC_CHANNELS.WIFI_CURRENT_SSID, async () => {
    try {
      const wifi = await getCurrentWifiSSID();
      return wifi;
    } catch (error) {
      logger.error('IPC错误：获取WiFi SSID失败', {
        错误: error instanceof Error ? error.message : String(error),
      });
      return { connected: false, ssid: null };
    }
  });

  /**
   * 获取完整网络信息（包含 WiFi）
   */
  ipcMain.handle(IPC_CHANNELS.WIFI_FULL_INFO, async () => {
    try {
      const fullInfo = await getFullNetworkInfo();
      return fullInfo;
    } catch (error) {
      logger.error('IPC错误：获取完整网络信息失败', {
        错误: error instanceof Error ? error.message : String(error),
      });
      return {
        ipv4: null,
        ipv6: null,
        mac: null,
        wifi: { connected: false, ssid: null },
      };
    }
  });

  logger.info('网络IPC处理器已注册');
}

/**
 * 启动网络状态轮询
 */
export function startNetworkPolling(
  networkDetector: NetworkDetector,
  logger: ReturnType<typeof createLogger>,
  intervalMs: number = 30000,
  autoReconnectService?: AutoReconnectService,
  enableHeartbeat: boolean = false
) {
  logger.info('===== 启动网络监控服务 =====', {
    心跳检测: enableHeartbeat ? '已启用' : '已禁用',
    轮询间隔: enableHeartbeat ? `${intervalMs / 1000}秒` : '不适用',
    自动重连: autoReconnectService ? '已配置' : '未配置',
  });

  // 保存心跳间隔，用于倒计时
  heartbeatIntervalMs = intervalMs;

  // 定义状态处理回调
  const statusCallback = async (status: NetworkStatus) => {
    // 保存最新的网络状态（用于心跳倒计时）
    lastNetworkStatus = status;

    // 广播给所有窗口
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      win.webContents.send(IPC_EVENTS.NETWORK_STATUS_CHANGED, status);
    });

    // 如果有自动重连服务，处理状态变化
    if (autoReconnectService) {
      await autoReconnectService.handleStatusChange(status);
    }

    // 更新下次心跳时间（如果启用了心跳检测）
    if (enableHeartbeat) {
      nextHeartbeatTime = Date.now() + intervalMs;
    }
  };

  if (enableHeartbeat) {
    // 启动持续轮询
    logger.info(`启动心跳检测轮询，间隔: ${intervalMs / 1000}秒`);

    // 设置下次心跳时间（首次立即执行）
    nextHeartbeatTime = Date.now();

    networkDetector.startPolling(statusCallback, { interval: intervalMs, immediate: true });
    logger.success('心跳检测轮询已启动');

    // 启动倒计时广播（每秒发送一次）
    startHeartbeatCountdown(logger);
  } else {
    // 只执行一次检测
    logger.info('心跳检测已禁用，仅执行初始网络状态检测');
    networkDetector.getNetworkStatus().then((status) => {
      logger.success('初始网络状态检测完成', {
        网络连接: status.connected ? '是' : '否',
        已认证: status.authenticated ? '是' : '否',
      });
      statusCallback(status);
    }).catch((err) => {
      logger.error('获取初始网络状态失败', {
        错误: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/**
 * 启动心跳检测倒计时广播
 */
function startHeartbeatCountdown(logger: ReturnType<typeof createLogger>) {
  // 清除旧的定时器
  if (heartbeatCountdownTimer) {
    clearInterval(heartbeatCountdownTimer);
  }

  // 每秒广播一次剩余时间和当前状态
  heartbeatCountdownTimer = setInterval(() => {
    const now = Date.now();
    const remainingMs = Math.max(0, nextHeartbeatTime - now);
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    // 广播倒计时和详细信息到所有窗口
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_EVENTS.HEARTBEAT_COUNTDOWN, {
          remainingSeconds,
          totalSeconds: Math.floor(heartbeatIntervalMs / 1000),
          // 添加详细的心跳检测信息
          connected: lastNetworkStatus?.connected ?? false,
          authenticated: lastNetworkStatus?.authenticated ?? false,
          latency: lastNetworkStatus?.latency ?? null,
          lastCheckTime: lastNetworkStatus ? Date.now() : null,
        });
      }
    });

    // 如果倒计时结束，更新下次心跳时间
    if (remainingMs <= 0) {
      nextHeartbeatTime = now + heartbeatIntervalMs;
    }
  }, 1000);

  logger.info('心跳检测倒计时已启动');
}

/**
 * 停止网络状态轮询
 */
export function stopNetworkPolling(
  networkDetector: NetworkDetector,
  logger: ReturnType<typeof createLogger>
) {
  logger.info('停止网络监控服务');
  networkDetector.stopPolling();

  // 停止心跳检测倒计时
  if (heartbeatCountdownTimer) {
    clearInterval(heartbeatCountdownTimer);
    heartbeatCountdownTimer = null;
    logger.info('心跳检测倒计时已停止');
  }

  logger.success('网络状态轮询已停止');
}
