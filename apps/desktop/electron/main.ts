import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  createAuthService,
  createConfigManager,
  createAccountManager,
  createWifiManager,
  createNetworkDetector,
  createLogger,
} from '@repo/shared';

import { createElectronStorage } from './services/store';
import { registerAllIPC, startBackgroundServices, stopBackgroundServices, AppServices } from './ipc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..');

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

let win: BrowserWindow | null;
let services: AppServices | null = null;

/**
 * 初始化服务
 */
async function initServices(): Promise<AppServices> {
  // 创建日志服务
  const logger = createLogger(500);
  logger.info('应用启动');

  // 创建存储适配器
  const storage = createElectronStorage();

  // 创建配置管理器
  const configManager = createConfigManager(storage);
  await configManager.load();
  logger.info('配置加载完成');

  // 创建其他服务
  const authService = createAuthService();
  const accountManager = createAccountManager(configManager);
  const wifiManager = createWifiManager(configManager);
  const networkDetector = createNetworkDetector();

  return {
    authService,
    configManager,
    accountManager,
    wifiManager,
    networkDetector,
    logger,
  };
}

function createWindow() {
  win = new BrowserWindow({
    width: 880,
    height: 670,
    resizable: false,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (services) {
      stopBackgroundServices(services);
    }
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (services) {
    stopBackgroundServices(services);
    services.logger.info('应用退出');
  }
});

app.whenReady().then(async () => {
  try {
    // 初始化服务
    services = await initServices();

    // 注册 IPC 处理器
    registerAllIPC(services);

    // 启动后台服务
    const pollingInterval = services.configManager.getSettings().pollingInterval * 1000;
    startBackgroundServices(services, pollingInterval);

    // 创建窗口
    createWindow();
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
});
