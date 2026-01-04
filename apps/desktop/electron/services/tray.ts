/**
 * 系统托盘服务
 */

import { Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export type TrayStatus = 'connected' | 'disconnected' | 'connecting';

export interface TrayCallbacks {
  onLogin: () => Promise<void>;
  onLogout: () => Promise<void>;
  onShowWindow: () => void;
  onQuit: () => void;
}

// 内置的 base64 图标（16x16 简单 WiFi 图标）
const TRAY_ICON_CONNECTED = `
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAA
AlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5
vuPBoAAADCSURBVDiNpdMxSgNBGAXg7yUQBBtBG0vtPIItWHgFL+ABPIKVjYWNhYWFhY
WFhYXgATyCN/AAHsEjWIiFICh+Nru7Mybs+mBgmJn3/jczDH8oJVfxHl9/rRxghFv8xA
c8xRXm8Qkn6GLqn4KnOMYHPEYPy5jBbXzGOXZxgAYzGGAJb/AQR5jDWWzhAu3kJg5xCf
f4iDl00MEe3mARrzGLM+zgAm6x0SZ+4AT7OMI+VnGNHlawjUu4i0U8x3v8wC/2JTsxNV
hJBQAAAABJRU5ErkJggg==
`
  .trim()
  .replace(/\s/g, '');

const TRAY_ICON_DISCONNECTED = `
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAA
AlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5
vuPBoAAADeSURBVDiNpZOxSgNBFEXPTSIIFoL/YGNlZ+cHpPQT/AQ/wd7Gws7CwsLCws
LCQvAT/AT/wE+wsbOzshAEBUFyLHZ3ZjYkxgOPYZi595137szwn6SkHT7h6q+V3RrB+o
SfuI8LLOAnTrCNLqb+KXiMI3zAI/SwihmcxV1cYBcHaDAT9fASr7CM15jFGXZwDl3sZI
cDnOMSbuAQi3iFWZxhB+dwC+t1A6c4xj72sYprHKCHFWzjEm5jEU8xi9N44l18wQ/cxB
4W8BpzOI7nOMU1buFW1OA+DnGEPaziBb7hJ37xG2FYOzHVHJcoAAAAAElFTkSuQmCC
`
  .trim()
  .replace(/\s/g, '');

export class TrayService {
  private tray: Tray | null = null;
  private status: TrayStatus = 'disconnected';
  private callbacks: TrayCallbacks;
  private iconDir: string;

  constructor(iconDir: string, callbacks: TrayCallbacks) {
    this.iconDir = iconDir;
    this.callbacks = callbacks;
  }

  /**
   * 初始化托盘
   */
  init(): void {
    const icon = this.getIcon('disconnected');
    this.tray = new Tray(icon);
    this.tray.setToolTip('NetMate - 校园网登录');

    // 点击托盘图标显示窗口
    this.tray.on('click', () => {
      this.callbacks.onShowWindow();
    });

    // 双击托盘图标显示窗口（Windows）
    this.tray.on('double-click', () => {
      this.callbacks.onShowWindow();
    });

    this.updateMenu();
  }

  /**
   * 获取图标
   */
  private getIcon(status: 'connected' | 'disconnected'): Electron.NativeImage {
    // 根据平台选择图标文件
    let iconFiles: string[] = [];

    if (process.platform === 'win32') {
      // Windows: 优先使用ico，其次png
      const iconName = status === 'connected' ? 'tray-icon' : 'tray-icon-disconnected';
      iconFiles = [
        path.join(this.iconDir, `${iconName}.ico`),
        path.join(this.iconDir, `${iconName}.png`),
      ];
    } else {
      // macOS/Linux: 使用png
      const iconName = status === 'connected' ? 'tray-icon.png' : 'tray-icon-disconnected.png';
      iconFiles = [path.join(this.iconDir, iconName)];
    }

    // 尝试从文件加载
    for (const iconPath of iconFiles) {
      if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
          if (process.platform === 'darwin') {
            icon.setTemplateImage(true);
          }
          return icon;
        }
      }
    }

    // 使用内置的 base64 图标
    const base64Data = status === 'connected' ? TRAY_ICON_CONNECTED : TRAY_ICON_DISCONNECTED;
    const icon = nativeImage.createFromDataURL(`data:image/png;base64,${base64Data}`);
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }
    return icon;
  }

  /**
   * 更新托盘状态
   */
  setStatus(status: TrayStatus): void {
    this.status = status;

    if (!this.tray) return;

    // 更新图标
    const iconStatus = status === 'connected' ? 'connected' : 'disconnected';
    const icon = this.getIcon(iconStatus);
    this.tray.setImage(icon);

    // 更新提示文字
    const tooltip =
      status === 'connected'
        ? 'NetMate - 已连接'
        : status === 'connecting'
          ? 'NetMate - 连接中...'
          : 'NetMate - 未连接';

    this.tray.setToolTip(tooltip);

    // 更新菜单
    this.updateMenu();
  }

  /**
   * 更新右键菜单
   */
  private updateMenu(): void {
    if (!this.tray) return;

    const isConnected = this.status === 'connected';
    const isConnecting = this.status === 'connecting';

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => this.callbacks.onShowWindow(),
      },
      { type: 'separator' },
      {
        label: isConnected ? '断开连接' : '立即登录',
        enabled: !isConnecting,
        click: async () => {
          if (isConnected) {
            await this.callbacks.onLogout();
          } else {
            await this.callbacks.onLogin();
          }
        },
      },
      { type: 'separator' },
      {
        label: '退出应用',
        click: () => this.callbacks.onQuit(),
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  /**
   * 销毁托盘
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): TrayStatus {
    return this.status;
  }
}

/**
 * 创建托盘服务实例
 */
export function createTrayService(iconDir: string, callbacks: TrayCallbacks): TrayService {
  return new TrayService(iconDir, callbacks);
}
