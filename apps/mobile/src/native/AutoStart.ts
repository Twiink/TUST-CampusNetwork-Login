/**
 * 开机自启 TypeScript 桥接
 *
 * 提供开机自启控制能力（仅 Android）
 */

import { NativeModules, Platform } from 'react-native';

interface AutoStartModuleInterface {
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<boolean>;
}

const { AutoStartModule } = NativeModules as {
  AutoStartModule: AutoStartModuleInterface | undefined;
};

/**
 * 检查开机自启模块是否可用
 */
export function isAutoStartAvailable(): boolean {
  return Platform.OS === 'android' && AutoStartModule !== undefined;
}

/**
 * 获取开机自启状态
 */
export async function isAutoStartEnabled(): Promise<boolean> {
  if (!isAutoStartAvailable()) {
    return false;
  }

  try {
    return await AutoStartModule!.isEnabled();
  } catch (error) {
    console.warn('Failed to get auto-start status:', error);
    return false;
  }
}

/**
 * 设置开机自启状态
 */
export async function setAutoStartEnabled(enabled: boolean): Promise<boolean> {
  if (!isAutoStartAvailable()) {
    console.warn('AutoStart is not available on this platform');
    return false;
  }

  try {
    return await AutoStartModule!.setEnabled(enabled);
  } catch (error) {
    console.warn('Failed to set auto-start:', error);
    return false;
  }
}

export default {
  isAutoStartAvailable,
  isAutoStartEnabled,
  setAutoStartEnabled,
};
