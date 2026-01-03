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
    logger.debug('IPC请求：获取网络状态');
    try {
      const status = await networkDetector.getNetworkStatus();
      logger.debug('IPC响应：网络状态获取成功', {
        连接状态: status.connected ? '已连接' : '未连接',
        认证状态: status.authenticated ? '已认证' : '未认证',
      });
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
    logger.debug('IPC请求：获取网络信息');
    const info = getNetworkInfo();
    logger.debug('IPC响应：网络信息获取成功', {
      IPv4: info.ipv4 || '无',
      MAC: info.mac || '无',
    });
    return info;
  });

  /**
   * 检查网络连通性
   */
  ipcMain.handle(IPC_CHANNELS.NETWORK_CHECK, async (): Promise<boolean> => {
    logger.debug('IPC请求：检查网络连通性');
    try {
      const connected = await networkDetector.checkConnectivity();
      logger.debug('IPC响应：网络连通性检查完成', {
        结果: connected ? '可连接' : '不可连接',
      });
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
    logger.debug('IPC请求：获取WiFi SSID');
    try {
      const wifi = await getCurrentWifiSSID();
      logger.debug('IPC响应：WiFi SSID获取成功', {
        连接状态: wifi.connected ? '已连接' : '未连接',
        SSID: wifi.ssid || '无',
      });
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
    logger.debug('IPC请求：获取完整网络信息');
    try {
      const fullInfo = await getFullNetworkInfo();
      logger.debug('IPC响应：完整网络信息获取成功', {
        IPv4: fullInfo.ipv4 || '无',
        WiFi_SSID: fullInfo.wifi?.ssid || '无',
      });
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

  // 定义状态处理回调
  const statusCallback = async (status: NetworkStatus) => {
    logger.debug('心跳检测：网络状态更新', {
      网络连接: status.connected ? '是' : '否',
      已认证: status.authenticated ? '是' : '否',
      WiFi连接: status.wifiConnected ? '是' : '否',
      WiFi名称: status.ssid || '无',
    });

    // 广播给所有窗口
    const windows = BrowserWindow.getAllWindows();
    logger.debug(`心跳检测：向 ${windows.length} 个窗口广播网络状态`);
    windows.forEach((win) => {
      win.webContents.send(IPC_EVENTS.NETWORK_STATUS_CHANGED, status);
    });

    // 如果有自动重连服务，处理状态变化
    if (autoReconnectService) {
      await autoReconnectService.handleStatusChange(status);
    }
  };

  if (enableHeartbeat) {
    // 启动持续轮询
    logger.info(`启动心跳检测轮询，间隔: ${intervalMs / 1000}秒`);
    networkDetector.startPolling(statusCallback, { interval: intervalMs, immediate: true });
    logger.success('心跳检测轮询已启动');
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
 * 停止网络状态轮询
 */
export function stopNetworkPolling(
  networkDetector: NetworkDetector,
  logger: ReturnType<typeof createLogger>
) {
  logger.info('停止网络监控服务');
  networkDetector.stopPolling();
  logger.success('网络状态轮询已停止');
}
