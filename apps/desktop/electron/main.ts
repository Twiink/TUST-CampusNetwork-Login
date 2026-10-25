import { app, BrowserWindow, powerMonitor } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { resolveNetworkInfo } from './services/network';
import { createTrayService, TrayService } from './services/tray';
import { createAutoReconnectService, AutoReconnectService } from './services/auto-reconnect';
import { createAutoLaunchService, AutoLaunchService } from './services/auto-launch';
import { createNotificationService, NotificationService } from './services/notification';
import { createUpdaterService, UpdaterService } from './services/updater';
import { createWifiSwitcherService, WifiSwitcherService } from './services/wifi-switcher';
import { createWifiEventListener, WifiEventListener } from './services/wifi-event-listener';
import type { FileLogger } from './services/file-logger';
import { devLog } from './utils/dev-log';
import { createMainWindow } from './main-window';
import { initAppServices } from './main-services';
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

const IS_E2E_TEST = process.env['NETMATE_E2E'] === '1';

// WiFi SSID 轮询间隔：前台正常检测，后台（隐藏到托盘）降频以减少常驻 CPU/进程开销
const WIFI_CHECK_INTERVAL_FOREGROUND = 3000;
const WIFI_CHECK_INTERVAL_BACKGROUND = 8000;

let win: BrowserWindow | null;
let services: AppServices | null = null;
let trayService: TrayService | null = null;
let autoReconnectService: AutoReconnectService | null = null;
let autoLaunchService: AutoLaunchService | null = null;
let notificationService: NotificationService | null = null;
let updaterService: UpdaterService | null = null;
let wifiSwitcherService: WifiSwitcherService | null = null;
let wifiEventListener: WifiEventListener | null = null;
let fileLogger: FileLogger | null = null;
let forceQuit = false;

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
    createMainWindow({
      appRoot: process.env.APP_ROOT!,
      preloadPath: path.join(MAIN_DIST, 'preload.mjs'),
      rendererDist: RENDERER_DIST,
      devServerUrl: VITE_DEV_SERVER_URL,
      shouldQuit: () => forceQuit,
      onVisibilityChange: (hidden) => {
        wifiEventListener?.setCheckInterval(
          hidden ? WIFI_CHECK_INTERVAL_BACKGROUND : WIFI_CHECK_INTERVAL_FOREGROUND
        );
      },
      onDidFinishLoad: async (window) => {
        win = window;
        try {
          const currentStatus = await services!.networkDetector.getNetworkStatus();
          window.webContents.send('event:network:statusChanged', currentStatus);
          services!.logger.log('info', '窗口加载完成，已发送初始网络状态', {
            category: 'system',
            source: 'Main',
          });
        } catch (error) {
          services!.logger.error('获取初始网络状态失败', error);
        }
      },
    });
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
    services.logger.log('info', '应用退出', { category: 'system', source: 'Main' });
  }
  void services?.storage.flush().catch(() => undefined);
  if (fileLogger) {
    fileLogger.close();
    fileLogger = null;
  }
});

// 单实例锁：避免多开导致的重复后台服务、重复 WiFi 轮询与端口/托盘冲突
const gotSingleInstanceLock = IS_E2E_TEST ? true : app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  // 第二个实例启动时，聚焦已有窗口而非新开
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });
}

app.whenReady().then(async () => {
  try {
    // macOS: 设置 Dock 图标（开发模式下必需）
    if (process.platform === 'darwin') {
      const dockIconPath = path.join(process.env.APP_ROOT!, 'build', 'png', '512x512.png');
      app.dock?.setIcon(dockIconPath);
      devLog.info('[Main] Dock icon set to:', dockIconPath);
    }

    // 初始化服务
    const initialized = await initAppServices();
    services = initialized;
    fileLogger = initialized.fileLogger;
    void services;

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
    notificationService.setEnabled(settings.showNotification ?? true);
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
      },
      services.wifiManager
    );

    // 挂起恢复后路由/DHCP 可能刚变化，立即做一次轻量检测，不等完整心跳周期。
    powerMonitor.on('resume', () => {
      services?.networkDetector
        .getNetworkStatus()
        .then((status) => {
          win?.webContents.send('event:network:statusChanged', status);
        })
        .catch((error) => {
          services?.logger.error('系统恢复后的网络检测失败', error);
        });
    });

    // 启动后台服务（带自动重连和心跳检测设置）
    const pollingInterval =
      (settings.heartbeatIntervalSeconds ?? settings.pollingInterval ?? 30) * 1000;
    startBackgroundServices(
      services,
      pollingInterval,
      autoReconnectService,
      settings.enableHeartbeat
    );

    // 创建窗口
    createMainWindow({
      appRoot: process.env.APP_ROOT!,
      preloadPath: path.join(MAIN_DIST, 'preload.mjs'),
      rendererDist: RENDERER_DIST,
      devServerUrl: VITE_DEV_SERVER_URL,
      shouldQuit: () => forceQuit,
      onVisibilityChange: (hidden) => {
        wifiEventListener?.setCheckInterval(
          hidden ? WIFI_CHECK_INTERVAL_BACKGROUND : WIFI_CHECK_INTERVAL_FOREGROUND
        );
      },
      onDidFinishLoad: async (window) => {
        win = window;
        try {
          const currentStatus = await services!.networkDetector.getNetworkStatus();
          window.webContents.send('event:network:statusChanged', currentStatus);
          services!.logger.log('info', '窗口加载完成，已发送初始网络状态', {
            category: 'system',
            source: 'Main',
          });
        } catch (error) {
          services!.logger.error('获取初始网络状态失败', error);
        }
      },
    });

    if (IS_E2E_TEST) {
      services.logger.info('E2E 测试模式已启用，跳过托盘与 WiFi 事件监听初始化');
    } else {
      // 创建托盘服务
      trayService = createTrayService(iconDir, {
        onLogin: async () => {
          // 获取当前账户并登录
          const currentAccount = services?.accountManager.getCurrentAccount();
          if (currentAccount && services) {
            const networkInfo = await resolveNetworkInfo();
            if (!networkInfo.ipv4) {
              services.logger.error('托盘登录失败：无法获取 IP 地址');
              return;
            }

            trayService?.setStatus('connecting');
            try {
              services.authService.setServerUrl(currentAccount.serverUrl);
              // 托盘登录使用带重试封装（3 次、间隔 2 秒），对齐生产验证的参考实现
              const result = await services.authService.loginWithRetry({
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
            // 注销请求不依赖本机 IP，获取仅用于日志
            const networkInfo = await resolveNetworkInfo();

            try {
              const result = await services.authService.logout(networkInfo.ipv4 || undefined);
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

      if (trayService.init()) {
        services.logger.info('托盘服务已初始化');
      } else {
        services.logger.warn('托盘服务初始化失败，将继续在无托盘模式下运行');
      }

      // 创建并启动 WiFi 事件监听器
      // 监听系统 WiFi 连接/断开事件，自动触发网络状态更新和重连；
      // 同时接入认证重连服务，WiFi 连接/切换后立即认证（快速路径）
      wifiEventListener = createWifiEventListener({
        networkDetector: services.networkDetector,
        logger: services.logger,
        window: win,
        checkInterval: WIFI_CHECK_INTERVAL_FOREGROUND, // 前台 3s 检测 SSID 变化（隐藏到托盘后自动降频至 8s）
        wifiManager: services.wifiManager,
        wifiSwitcherService: wifiSwitcherService,
        configManager: services.configManager,
        autoReconnectService: autoReconnectService ?? undefined,
      });
      wifiEventListener.start();
      services.logger.info('WiFi 事件监听器已启动，检测间隔: 1秒（支持自动重连）');
    }

    services.logger.log('success', '===== 应用初始化完成 =====', {
      category: 'system',
      source: 'Main',
    });
  } catch (error) {
    devLog.error('Failed to initialize app:', error);
    if (services) {
      services.logger.log('error', '应用初始化失败', {
        category: 'system',
        source: 'Main',
        data: error,
      });
    }
    app.quit();
  }
});
