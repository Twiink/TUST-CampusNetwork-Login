/**
 * 后台服务 TypeScript 桥接
 *
 * 提供后台服务控制能力（仅 Android）
 */

import { NativeModules, Platform } from 'react-native';

interface BackgroundServiceModuleInterface {
  startService(interval: number): Promise<boolean>;
  stopService(): Promise<boolean>;
  isRunning(): Promise<boolean>;
}

const { BackgroundServiceModule } = NativeModules as {
  BackgroundServiceModule: BackgroundServiceModuleInterface | undefined;
};

/**
 * 检查后台服务模块是否可用
 */
export function isBackgroundServiceAvailable(): boolean {
  return Platform.OS === 'android' && BackgroundServiceModule !== undefined;
}

/**
 * 启动后台服务
 *
 * @param interval 心跳检测间隔（毫秒），默认 30000
 */
export async function startBackgroundService(interval: number = 30000): Promise<boolean> {
  if (!isBackgroundServiceAvailable()) {
    console.warn('BackgroundService is not available on this platform');
    return false;
  }

  try {
    return await BackgroundServiceModule!.startService(interval);
  } catch (error) {
    console.warn('Failed to start background service:', error);
    return false;
  }
}

/**
 * 停止后台服务
 */
export async function stopBackgroundService(): Promise<boolean> {
  if (!isBackgroundServiceAvailable()) {
    return false;
  }

  try {
    return await BackgroundServiceModule!.stopService();
  } catch (error) {
    console.warn('Failed to stop background service:', error);
    return false;
  }
}

/**
 * 检查后台服务是否正在运行
 */
export async function isBackgroundServiceRunning(): Promise<boolean> {
  if (!isBackgroundServiceAvailable()) {
    return false;
  }

  try {
    return await BackgroundServiceModule!.isRunning();
  } catch (error) {
    console.warn('Failed to check background service status:', error);
    return false;
  }
}

export default {
  isBackgroundServiceAvailable,
  startBackgroundService,
  stopBackgroundService,
  isBackgroundServiceRunning,
};
