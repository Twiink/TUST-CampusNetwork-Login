/**
 * 系统通知 TypeScript 桥接
 *
 * 提供系统通知功能
 */

import { Platform, Alert } from 'react-native';

export interface NotificationOptions {
  title: string;
  body: string;
  silent?: boolean;
}

/**
 * 显示通知
 *
 * 注意：完整的本地通知功能需要安装额外的库如 @notifee/react-native
 * 目前使用 Alert 作为临时方案
 */
export async function showNotification(options: NotificationOptions): Promise<boolean> {
  const { title, body } = options;

  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    // 临时使用 Alert，后续可替换为本地通知库
    Alert.alert(title, body);
    return true;
  }

  return false;
}

/**
 * 显示连接成功通知
 */
export async function showConnectedNotification(message?: string): Promise<boolean> {
  return showNotification({
    title: 'NetMate',
    body: message || '网络连接成功',
  });
}

/**
 * 显示断开连接通知
 */
export async function showDisconnectedNotification(message?: string): Promise<boolean> {
  return showNotification({
    title: 'NetMate',
    body: message || '网络连接已断开',
  });
}

/**
 * 显示重连中通知
 */
export async function showReconnectingNotification(
  attempt: number,
  maxAttempts: number
): Promise<boolean> {
  return showNotification({
    title: 'NetMate',
    body: `正在重连 (${attempt}/${maxAttempts})...`,
    silent: true,
  });
}

/**
 * 显示重连失败通知
 */
export async function showReconnectFailedNotification(message?: string): Promise<boolean> {
  return showNotification({
    title: 'NetMate',
    body: message || '自动重连失败',
  });
}

/**
 * 显示更新可用通知
 */
export async function showUpdateAvailableNotification(version: string): Promise<boolean> {
  return showNotification({
    title: 'NetMate',
    body: `发现新版本 ${version}，请更新`,
  });
}

export default {
  showNotification,
  showConnectedNotification,
  showDisconnectedNotification,
  showReconnectingNotification,
  showReconnectFailedNotification,
  showUpdateAvailableNotification,
};
