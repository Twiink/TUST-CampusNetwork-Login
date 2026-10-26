/**
 * 系统通知服务
 */

import { Notification, nativeImage } from 'electron';
import path from 'node:path';
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from '@repo/shared';

/** 与设置页「通知设置」四个开关一一对应的事件类型 */
export type NotificationEventKind = keyof NotificationSettings;

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationOptions {
  /** 通知标题 */
  title: string;
  /** 通知内容 */
  body: string;
  /** 通知类型 */
  type?: NotificationType;
  /** 是否静默（不播放声音） */
  silent?: boolean;
  /** 点击回调 */
  onClick?: () => void;
}

/**
 * 系统通知服务类
 */
export class NotificationService {
  private enabled: boolean = true;
  private eventSettings: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS };
  private iconPath: string;

  constructor(iconDir: string) {
    this.iconPath = path.join(iconDir, 'electron-vite.svg');
  }

  /**
   * 设置是否启用通知
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 获取是否启用通知
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 设置各通知场景的独立开关（settings.notificationSettings）
   */
  setEventSettings(settings: NotificationSettings): void {
    this.eventSettings = { ...settings };
  }

  /**
   * 某一场景的通知是否开启
   */
  isEventEnabled(kind: NotificationEventKind): boolean {
    return this.enabled && this.eventSettings[kind] === true;
  }

  /**
   * 按场景开关发送通知
   */
  notifyEvent(kind: NotificationEventKind, body: string): boolean {
    if (!this.isEventEnabled(kind)) {
      return false;
    }
    const titles: Record<NotificationEventKind, string> = {
      wifiDisconnected: 'NetMate - WiFi 已断开',
      reconnectSuccess: 'NetMate - WiFi 已重新连接',
      reconnectFailed: 'NetMate - 自动重连失败',
      authRecovered: 'NetMate - 校园网认证已恢复',
    };
    return this.show({ title: titles[kind], body });
  }

  /**
   * 显示通知
   */
  show(options: NotificationOptions): boolean {
    if (!this.enabled) {
      return false;
    }

    // 检查系统是否支持通知
    if (!Notification.isSupported()) {
      return false;
    }

    try {
      const notification = new Notification({
        title: options.title,
        body: options.body,
        silent: options.silent ?? false,
        icon: this.getIcon(),
      });

      if (options.onClick) {
        notification.on('click', options.onClick);
      }

      notification.show();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 显示连接成功通知
   */
  showConnected(message?: string): boolean {
    return this.show({
      title: 'NetMate - 已连接',
      body: message || '校园网认证成功',
      type: 'success',
    });
  }

  /**
   * 显示断开连接通知
   */
  showDisconnected(message?: string): boolean {
    return this.show({
      title: 'NetMate - 已断开',
      body: message || '网络连接已断开',
      type: 'warning',
    });
  }

  /**
   * 显示重连中通知
   */
  showReconnecting(attempt: number, maxAttempts: number): boolean {
    return this.show({
      title: 'NetMate - 正在重连',
      body: `正在尝试重新连接 (${attempt}/${maxAttempts})`,
      type: 'info',
      silent: true,
    });
  }

  /**
   * 显示重连失败通知
   */
  showReconnectFailed(message?: string): boolean {
    return this.show({
      title: 'NetMate - 重连失败',
      body: message || '自动重连失败，请手动重试',
      type: 'error',
    });
  }

  /**
   * 显示更新可用通知
   */
  showUpdateAvailable(version: string): boolean {
    return this.show({
      title: 'NetMate - 发现新版本',
      body: `新版本 ${version} 可用，点击查看`,
      type: 'info',
    });
  }

  /**
   * 获取图标
   */
  private getIcon(): Electron.NativeImage | undefined {
    try {
      return nativeImage.createFromPath(this.iconPath);
    } catch {
      return undefined;
    }
  }
}

/**
 * 创建通知服务实例
 */
export function createNotificationService(iconDir: string): NotificationService {
  return new NotificationService(iconDir);
}
