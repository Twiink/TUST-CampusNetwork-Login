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
import { createDesktopWifiAdapter } from './services/wifi-adapter';
import { createTrayService, TrayService } from './services/tray';
import { createAutoReconnectService, AutoReconnectService } from './services/auto-reconnect';
import { createAutoLaunchService, AutoLaunchService } from './services/auto-launch';
import { createNotificationService, NotificationService } from './services/notification';
import { createUpdaterService, UpdaterService } from './services/updater';
import { createWifiSwitcherService, WifiSwitcherService } from './services/wifi-switcher';
import { createWifiEventListener, WifiEventListener } from './services/wifi-event-listener';
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
let wifiEventListener: WifiEventListener | null = null;
let forceQuit = false;

/**
 * 初始化服务
 */
async function initServices(): Promise<AppServices> {
  // 创建日志服务（保留7天，最多500条）
  const logger = createLogger(500, 7);

  // 添加控制台日志监听器（输出到终端）
  logger.addListener((entry) => {
    const timestamp = entry.timestamp.toLocaleTimeString('zh-CN', { hour12: false });
    const level = entry.level.toUpperCase().padEnd(7);
    const levelColors = {
      DEBUG: '\x1b[36m',   // Cyan
      INFO: '\x1b[37m',    // White
      SUCCESS: '\x1b[32m', // Green
      WARN: '\x1b[33m',    // Yellow
      ERROR: '\x1b[31m',   // Red
    };
    const color = levelColors[entry.level.toUpperCase() as keyof typeof levelColors] || '\x1b[37m';
    const reset = '\x1b[0m';

    let message = `${color}[${timestamp}] [${level}]${reset} ${entry.message}`;
    if (entry.data) {
      message += ` ${reset}\x1b[90m${JSON.stringify(entry.data)}\x1b[0m`;
    }
    console.log(message);
  });

  logger.info('===== NetMate 应用启动 =====');
  logger.info(`运行平台: ${process.platform}`);
  logger.info(`应用版本: ${app.getVersion()}`);

  // 创建存储适配器
  const storage = createElectronStorage();
  logger.info('存储服务初始化完成');

  // 创建配置管理器
  const configManager = createConfigManager(storage, logger);
  await configManager.load();
  const config = configManager.getConfig();
  if (config) {
    logger.info('配置加载完成', {
      账户数量: config.accounts.length,
      WiFi配置数量: config.wifiList.length,
      心跳检测: config.settings.enableHeartbeat ? '已启用' : '已禁用',
      自动重连: config.settings.autoReconnect ? '已启用' : '已禁用',
    });
  }

  // 创建其他服务
  const authService = createAuthService(undefined, logger);
  const accountManager = createAccountManager(configManager, logger);
  const wifiManager = createWifiManager(configManager, logger);
  logger.info('核心服务初始化完成');

  // 创建 WiFi 适配器
  const wifiAdapter = createDesktopWifiAdapter();
  const networkDetector = createNetworkDetector(wifiAdapter, logger);
  logger.info('网络检测服务初始化完成');

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
  // 获取图标路径 - 兼容开发和生产环境
  const getIconPath = () => {
    // APP_ROOT 指向 apps/desktop 目录
    const buildDir = path.join(process.env.APP_ROOT!, 'build');

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
  console.log('[Main] Loading icon from:', iconPath); // 调试日志

  win = new BrowserWindow({
    width: 880,
    height: 670,
    resizable: false,
    icon: iconPath,
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
  win.webContents.on('did-finish-load', async () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());

    // 窗口加载完成后，立即获取并发送当前网络状态
    // 避免用户看到长时间的"未连接"状态
    if (services) {
      try {
        const currentStatus = await services.networkDetector.getNetworkStatus();
        win?.webContents.send('event:network:statusChanged', currentStatus);
        services.logger.info('窗口加载完成，已发送初始网络状态');
      } catch (error) {
        services.logger.error('获取初始网络状态失败', error);
      }
    }
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
    // 更新 WiFi 事件监听器的窗口引用
    if (wifiEventListener) {
      wifiEventListener.setWindow(win);
    }
  }
});

app.on('before-quit', () => {
  forceQuit = true;
  if (trayService) {
    trayService.destroy();
    trayService = null;
  }
  if (wifiEventListener) {
    wifiEventListener.stop();
    wifiEventListener = null;
  }
  if (services) {
    stopBackgroundServices(services);
    services.logger.info('应用退出');
  }
});

app.whenReady().then(async () => {
  try {
    // macOS: 设置 Dock 图标（开发模式下必需）
    if (process.platform === 'darwin') {
      const dockIconPath = path.join(process.env.APP_ROOT!, 'build', 'png', '512x512.png');
      app.dock.setIcon(dockIconPath);
      console.log('[Main] Dock icon set to:', dockIconPath);
    }

    // 初始化服务
    services = await initServices();

    // 创建 WiFi 切换服务
    wifiSwitcherService = createWifiSwitcherService();
    // 配置已知网络列表（包含密码和优先级）
    const wifiConfigs = services.wifiManager.getWifiConfigs();
    wifiSwitcherService.setConfiguredNetworks(
      wifiConfigs.map((w) => ({
        ssid: w.ssid,
        password: w.password,
        priority: w.priority || 10,
      }))
    );

    // 注册 IPC 处理器（传递 wifiSwitcherService）
    registerAllIPC(services, wifiSwitcherService);

    // 注册托盘 IPC（在托盘创建前注册，使用 getter 函数）
    registerTrayIPC(() => trayService, services.logger);

    // 创建并注册开机自启服务
    autoLaunchService = createAutoLaunchService();
    registerAutoLaunchIPC(autoLaunchService, services.logger);

    // 获取设置
    const settings = services.configManager.getSettings();

    // 创建并注册通知服务
    // 使用 build 目录作为图标目录
    const iconDir = path.join(process.env.APP_ROOT!, 'build');
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
          // 广播重连开始事件
          win?.webContents.send('event:reconnect:progress', {
            status: 'reconnecting',
            currentAttempt: 0,
            maxAttempts: 3,
            message: '开始自动重连',
          });
        },
        onReconnectSuccess: () => {
          trayService?.setStatus('connected');
          notificationService?.showConnected();
          // 广播重连成功事件
          win?.webContents.send('event:reconnect:progress', {
            status: 'success',
            currentAttempt: 0,
            maxAttempts: 3,
            message: '自动重连成功',
          });
        },
        onReconnectFailed: async () => {
          trayService?.setStatus('disconnected');

          // 广播重连失败事件
          win?.webContents.send('event:reconnect:progress', {
            status: 'failed',
            currentAttempt: 3,
            maxAttempts: 3,
            message: '自动重连失败',
          });

          // 显示通知
          notificationService?.showReconnectFailed();

          // 注意：不在此处切换 WiFi
          // WiFi 切换由 wifi-event-listener 服务独立处理
          // 保持校园网重连与 WiFi 重连完全解耦
        },
        onReconnectAttempt: (attempt, maxAttempts) => {
          services?.logger.info(`自动重连尝试 ${attempt}/${maxAttempts}`);
          // 广播重连进度
          win?.webContents.send('event:reconnect:progress', {
            status: 'reconnecting',
            currentAttempt: attempt,
            maxAttempts: maxAttempts,
            message: `正在重连 (第 ${attempt}/${maxAttempts} 次)`,
          });
        },
      }
    );

    // 启动后台服务（带自动重连和心跳检测设置）
    const pollingInterval = settings.pollingInterval * 1000;
    startBackgroundServices(services, pollingInterval, autoReconnectService, settings.enableHeartbeat);

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

    // 创建并启动 WiFi 事件监听器
    // 监听系统 WiFi 连接/断开事件，自动触发网络状态更新和重连
    wifiEventListener = createWifiEventListener({
      networkDetector: services.networkDetector,
      logger: services.logger,
      window: win,
      checkInterval: 1000, // 1秒检测一次 SSID 变化（更快响应断开事件）
      wifiManager: services.wifiManager,
      wifiSwitcherService: wifiSwitcherService,
      configManager: services.configManager,
    });
    wifiEventListener.start();
    services.logger.info('WiFi 事件监听器已启动，检测间隔: 1秒（支持自动重连）');

    services.logger.success('===== 应用初始化完成 =====');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    if (services) {
      services.logger.error('应用初始化失败', error);
    }
    app.quit();
  }
});
