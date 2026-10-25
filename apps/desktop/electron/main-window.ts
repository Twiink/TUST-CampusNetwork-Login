/**
 * 主窗口创建(自 main.ts 抽出):图标解析、BrowserWindow 配置与首屏加载。
 */

import { BrowserWindow } from 'electron';
import path from 'node:path';
import { devLog } from './utils/dev-log';

export interface MainWindowOptions {
  appRoot: string;
  preloadPath: string;
  rendererDist: string;
  devServerUrl?: string;
  /** 是否退出应用(否则关闭时隐藏到托盘) */
  shouldQuit: () => boolean;
  /** 窗口隐藏/显示时的 WiFi 轮询调频 */
  onVisibilityChange: (hidden: boolean) => void;
  onDidFinishLoad: (win: BrowserWindow) => Promise<void>;
}

export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  // 获取图标路径 - 兼容开发和生产环境
  const getIconPath = () => {
    // APP_ROOT 指向 apps/desktop 目录
    const buildDir = path.join(options.appRoot, 'build');

    if (process.platform === 'win32') {
      return path.join(buildDir, 'icon.ico');
    } else if (process.platform === 'darwin') {
      // macOS 窗口标题栏图标使用小尺寸 PNG（32x32 或 64x64）
      return path.join(buildDir, 'png', '32x32.png');
    } else {
      return path.join(buildDir, 'icon.png');
    }
  };

  const iconPath = getIconPath();
  devLog.info('[Main] Loading icon from:', iconPath); // 调试日志

  const win = new BrowserWindow({
    width: 880,
    height: 670,
    resizable: false,
    icon: iconPath,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // 心跳与重连都在主进程；渲染层允许系统节流，降低隐藏态 CPU/内存。
      backgroundThrottling: true,
    },
  });

  // 前后台调频：窗口隐藏到托盘时降低 WiFi 轮询频率，显示时恢复
  win.on('hide', () => {
    options.onVisibilityChange(true);
  });
  win.on('show', () => {
    options.onVisibilityChange(false);
  });

  // 关闭窗口时最小化到托盘而非退出
  win.on('close', (event) => {
    if (!options.shouldQuit()) {
      event.preventDefault();
      win.hide();
    }
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', async () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());

    // 窗口加载完成后，立即获取并发送当前网络状态
    // 避免用户看到长时间的"未连接"状态
    await options.onDidFinishLoad(win);
  });

  if (options.devServerUrl) {
    void win.loadURL(options.devServerUrl);
  } else {
    void win.loadFile(path.join(options.rendererDist, 'index.html'));
  }

  return win;
}
