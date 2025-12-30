/**
 * 开机自启服务
 */

import AutoLaunch from 'auto-launch';
import { app } from 'electron';

/**
 * 开机自启服务类
 */
export class AutoLaunchService {
  private autoLauncher: AutoLaunch;

  constructor() {
    this.autoLauncher = new AutoLaunch({
      name: 'NetMate',
      path: app.getPath('exe'),
      isHidden: true, // 隐藏启动（最小化到托盘）
    });
  }

  /**
   * 获取当前自启状态
   */
  async isEnabled(): Promise<boolean> {
    try {
      return await this.autoLauncher.isEnabled();
    } catch {
      return false;
    }
  }

  /**
   * 启用开机自启
   */
  async enable(): Promise<boolean> {
    try {
      const isEnabled = await this.isEnabled();
      if (!isEnabled) {
        await this.autoLauncher.enable();
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 禁用开机自启
   */
  async disable(): Promise<boolean> {
    try {
      const isEnabled = await this.isEnabled();
      if (isEnabled) {
        await this.autoLauncher.disable();
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 设置开机自启状态
   */
  async setEnabled(enabled: boolean): Promise<boolean> {
    if (enabled) {
      return await this.enable();
    } else {
      return await this.disable();
    }
  }
}

/**
 * 创建开机自启服务实例
 */
export function createAutoLaunchService(): AutoLaunchService {
  return new AutoLaunchService();
}
