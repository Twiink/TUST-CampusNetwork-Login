/**
 * 网络相关 IPC 处理
 */

import { ipcMain, BrowserWindow } from 'electron';
import { NetworkDetector, NetworkStatus, createLogger } from '@repo/shared';
import { getNetworkInfo, getCurrentWifiSSID, getFullNetworkInfo } from '../services/network';
import { AutoReconnectService } from '../services/auto-reconnect';
import { IPC_CHANNELS, IPC_EVENTS } from './channels';

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
      return await networkDetector.getNetworkStatus();
    } catch (error) {
      logger.error('获取网络状态失败', error);
      return { connected: false, authenticated: false, wifiConnected: false };
    }
  });

  /**
   * 获取网络信息 (IP/MAC)
   */
  ipcMain.handle(IPC_CHANNELS.NETWORK_INFO, async () => {
    return getNetworkInfo();
  });

  /**
   * 检查网络连通性
   */
  ipcMain.handle(IPC_CHANNELS.NETWORK_CHECK, async (): Promise<boolean> => {
    try {
      return await networkDetector.checkConnectivity();
    } catch {
      return false;
    }
  });

  /**
   * 获取当前 WiFi SSID
   */
  ipcMain.handle(IPC_CHANNELS.WIFI_CURRENT_SSID, async () => {
    try {
      return await getCurrentWifiSSID();
    } catch (error) {
      logger.error('获取 WiFi SSID 失败', error);
      return { connected: false, ssid: null };
    }
  });

  /**
   * 获取完整网络信息（包含 WiFi）
   */
  ipcMain.handle(IPC_CHANNELS.WIFI_FULL_INFO, async () => {
    try {
      return await getFullNetworkInfo();
    } catch (error) {
      logger.error('获取完整网络信息失败', error);
      return {
        ipv4: null,
        ipv6: null,
        mac: null,
        wifi: { connected: false, ssid: null },
      };
    }
  });
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
  // 定义状态处理回调
  const statusCallback = async (status: any) => {
    // 广播给所有窗口
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC_EVENTS.NETWORK_STATUS_CHANGED, status);
    });

    // 如果有自动重连服务，处理状态变化
    if (autoReconnectService) {
      await autoReconnectService.handleStatusChange(status);
    }
  };

  if (enableHeartbeat) {
    // 启动持续轮询
    networkDetector.startPolling(statusCallback, { interval: intervalMs, immediate: true });
    logger.info(`网络状态轮询已启动 (间隔: ${intervalMs / 1000}s)`);
  } else {
    // 只执行一次检测
    networkDetector.getNetworkStatus().then(statusCallback).catch((err) => {
      logger.error('获取初始网络状态失败', err);
    });
    logger.info('网络状态已检测（心跳检测已关闭）');
  }
}

/**
 * 停止网络状态轮询
 */
export function stopNetworkPolling(
  networkDetector: NetworkDetector,
  logger: ReturnType<typeof createLogger>
) {
  networkDetector.stopPolling();
  logger.info('网络状态轮询已停止');
}
