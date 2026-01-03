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
import { getNetworkInfo } from './services/network';
import { getCurrentWifiSSID } from './services/wifi-detector';
import { createDesktopWifiAdapter } from './services/wifi-adapter';
import { createTrayService, TrayService } from './services/tray';
import { createAutoReconnectService, AutoReconnectService } from './services/auto-reconnect';
import { createAutoLaunchService, AutoLaunchService } from './services/auto-launch';
import { createNotificationService, NotificationService } from './services/notification';
import { createUpdaterService, UpdaterService } from './services/updater';
import { createWifiSwitcherService, WifiSwitcherService } from './services/wifi-switcher';
import {
  registerAllIPC,
  registerTrayIPC,
  registerAutoLaunchIPC,
  registerNotificationIPC,
  registerUpdaterIPC,
  startBackgroundServices,
  stopBackgroundServices,
  AppServices,
} from './ipc';

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
let trayService: TrayService | null = null;
let autoReconnectService: AutoReconnectService | null = null;
let autoLaunchService: AutoLaunchService | null = null;
let notificationService: NotificationService | null = null;
let updaterService: UpdaterService | null = null;
let wifiSwitcherService: WifiSwitcherService | null = null;
let forceQuit = false;

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

  // 创建 WiFi 适配器
  const wifiAdapter = createDesktopWifiAdapter();
  const networkDetector = createNetworkDetector(wifiAdapter);

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
      preload: path.join(MAIN_DIST, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 关闭窗口时最小化到托盘而非退出
  win.on('close', (event) => {
    if (!forceQuit) {
      event.preventDefault();
      win?.hide();
    }
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
  forceQuit = true;
  if (trayService) {
    trayService.destroy();
    trayService = null;
  }
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

    // 注册托盘 IPC（在托盘创建前注册，使用 getter 函数）
    registerTrayIPC(() => trayService, services.logger);

    // 创建并注册开机自启服务
    autoLaunchService = createAutoLaunchService();
    registerAutoLaunchIPC(autoLaunchService, services.logger);

    // 获取设置
    const settings = services.configManager.getSettings();

    // 创建并注册通知服务
    const iconDir = process.env.VITE_PUBLIC || '';
    notificationService = createNotificationService(iconDir);
    notificationService.setEnabled(settings.showNotification);
    registerNotificationIPC(notificationService, services.logger);

    // 创建并注册更新服务
    updaterService = createUpdaterService(services.logger, {
      onUpdateAvailable: (info) => {
        notificationService?.showUpdateAvailable(info.version);
      },
    });
    registerUpdaterIPC(updaterService, services.logger);

    // 检查更新（仅在生产环境）
    if (!VITE_DEV_SERVER_URL && settings.autoUpdate) {
      setTimeout(() => {
        updaterService?.checkForUpdates().catch(() => {
          // 忽略更新检查错误
        });
      }, 5000);
    }

    // 创建 WiFi 切换服务
    wifiSwitcherService = createWifiSwitcherService();
    // 配置已知网络列表（按优先级排序）
    const wifiConfigs = services.wifiManager.getWifiConfigs();
    wifiSwitcherService.setConfiguredNetworks(wifiConfigs.map((w) => w.ssid));

    // 创建自动重连服务
    autoReconnectService = createAutoReconnectService(
      services.authService,
      services.accountManager,
      services.logger,
      {
        enabled: settings.autoReconnect,
        maxRetries: 3,
        initialDelay: 2000,
        maxDelay: 30000,
      },
      {
        onReconnectStart: () => {
          trayService?.setStatus('connecting');
        },
        onReconnectSuccess: () => {
          trayService?.setStatus('connected');
          notificationService?.showConnected();
        },
        onReconnectFailed: async () => {
          trayService?.setStatus('disconnected');

          // 尝试切换到下一个可用 WiFi
          if (wifiSwitcherService && services) {
            const currentWifi = await getCurrentWifiSSID();
            services.logger.info('重连失败，尝试切换 WiFi 网络');

            const result = await wifiSwitcherService.switchToNextNetwork(currentWifi.ssid);
            if (result.success && result.ssid) {
              services.logger.info(`已切换到 WiFi: ${result.ssid}`);
              notificationService?.show({
                title: 'NetMate - 已切换网络',
                body: `已切换到 ${result.ssid}，正在重新连接...`,
              });
              // 触发重新连接
              setTimeout(() => {
                autoReconnectService?.triggerReconnect();
              }, 3000);
            } else {
              notificationService?.showReconnectFailed('无可用的备选网络');
            }
          } else {
            notificationService?.showReconnectFailed();
          }
        },
        onReconnectAttempt: (attempt, maxAttempts) => {
          services?.logger.info(`自动重连尝试 ${attempt}/${maxAttempts}`);
        },
      }
    );

    // 启动后台服务（带自动重连）
    const pollingInterval = settings.pollingInterval * 1000;
    startBackgroundServices(services, pollingInterval, autoReconnectService);

    // 创建窗口
    createWindow();

    // 创建托盘服务
    trayService = createTrayService(iconDir, {
      onLogin: async () => {
        // 获取当前账户并登录
        const currentAccount = services?.accountManager.getCurrentAccount();
        if (currentAccount && services) {
          const networkInfo = getNetworkInfo();
          if (!networkInfo.ipv4) {
            services.logger.error('托盘登录失败：无法获取 IP 地址');
            return;
          }

          trayService?.setStatus('connecting');
          try {
            services.authService.setServerUrl(currentAccount.serverUrl);
            const result = await services.authService.login({
              serverUrl: currentAccount.serverUrl,
              userAccount: currentAccount.username,
              userPassword: currentAccount.password,
              wlanUserIp: networkInfo.ipv4,
              wlanUserIpv6: networkInfo.ipv6 || undefined,
              wlanUserMac: networkInfo.mac || undefined,
              isp: currentAccount.isp,
            });
            if (result.success) {
              trayService?.setStatus('connected');
              services.logger.info('托盘登录成功');
            } else {
              trayService?.setStatus('disconnected');
              services.logger.error(`托盘登录失败: ${result.message}`);
            }
          } catch (error) {
            trayService?.setStatus('disconnected');
            services.logger.error('托盘登录异常', error);
          }
        }
      },
      onLogout: async () => {
        if (services) {
          const networkInfo = getNetworkInfo();
          if (!networkInfo.ipv4) {
            services.logger.error('托盘登出失败：无法获取 IP 地址');
            return;
          }

          try {
            const result = await services.authService.logout(networkInfo.ipv4);
            if (result.success) {
              trayService?.setStatus('disconnected');
              services.logger.info('托盘登出成功');
            } else {
              services.logger.error(`托盘登出失败: ${result.message}`);
            }
          } catch (error) {
            services.logger.error('托盘登出异常', error);
          }
        }
      },
      onShowWindow: () => {
        if (win) {
          win.show();
          win.focus();
        }
      },
      onQuit: () => {
        forceQuit = true;
        app.quit();
      },
    });
    trayService.init();
    services.logger.info('托盘服务已初始化');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
});
