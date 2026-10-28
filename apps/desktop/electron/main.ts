import { existsSync } from 'node:fs';
import { runtimePorts } from './runtime-ports';
import { app, BrowserWindow, powerMonitor, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { manualLogin, manualLogout } from './services/auth-session';
import { createTrayService, TrayService } from './services/tray';
import { createAutoReconnectService, AutoReconnectService } from './services/auto-reconnect';
import { createAutoLaunchService, AutoLaunchService } from './services/auto-launch';
import { createNotificationService, NotificationService } from './services/notification';
import { createUpdaterService, UpdaterService } from './services/updater';
import { WifiSwitcherService } from './services/wifi-switcher';
import { createWifiEventListener, WifiEventListener } from './services/wifi-event-listener';
import type { FileLogger } from './services/file-logger';
import type { AppConfig, AppSettings } from '@repo/shared';
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

const IS_E2E_TEST = runtimePorts.headlessShell === true;

// WiFi SSID 轮询间隔：前台正常检测，后台（隐藏到托盘）降频以减少常驻 CPU/进程开销
const WIFI_CHECK_INTERVAL_FOREGROUND = 5000;
const WIFI_CHECK_INTERVAL_BACKGROUND = 15000;

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
let createWindow: (() => BrowserWindow) | null = null;
let destroyHiddenWindowTimer: ReturnType<typeof setTimeout> | null = null;
let appliedWifiConfig = '';
let appliedSettings: AppSettings | null = null;

function heartbeatIntervalMs(settings: AppSettings): number {
  return (settings.heartbeatIntervalSeconds ?? settings.pollingInterval ?? 30) * 1000;
}

/**
 * 设置页保存后把新设置应用到运行中的服务（此前需重启应用才生效）
 */
function applyConfigChange(config: AppConfig): void {
  if (!services) return;
  const settings = config.settings;
  const previous = appliedSettings;
  appliedSettings = settings;

  notificationService?.setEnabled(Object.values(settings.notificationSettings).some(Boolean));
  notificationService?.setEventSettings(settings.notificationSettings);

  autoReconnectService?.setOptions({
    enabled: settings.autoReconnect && !settings.autoAuthPaused,
    failureThreshold: settings.heartbeatFailureThreshold,
  });

  wifiSwitcherService?.setConfiguredNetworks(
    config.wifiList.map((w) => ({
      ssid: w.ssid,
      password: w.password,
      priority: w.priority ?? 10,
      security: w.security,
    }))
  );
  // 新 WiFi/新密码/新冷却设置可以立即尝试
  const wifiKey = JSON.stringify([
    settings.autoReconnect,
    settings.wifiReconnectRetries,
    settings.wifiReconnectCooldownMinutes,
    config.wifiList,
  ]);
  if (wifiKey !== appliedWifiConfig) {
    appliedWifiConfig = wifiKey;
    wifiEventListener?.resetCooldown();
  }

  if (previous && previous.autoLaunch !== settings.autoLaunch && autoLaunchService) {
    const toggle = settings.autoLaunch ? autoLaunchService.enable() : autoLaunchService.disable();
    toggle.catch((error) => services?.logger.error('同步开机自启失败', error));
  }

  const heartbeatChanged =
    !previous ||
    previous.enableHeartbeat !== settings.enableHeartbeat ||
    heartbeatIntervalMs(previous) !== heartbeatIntervalMs(settings) ||
    previous.autoReconnect !== settings.autoReconnect;
  if (heartbeatChanged) {
    stopBackgroundServices(services);
    startBackgroundServices(
      services,
      heartbeatIntervalMs(settings),
      autoReconnectService ?? undefined,
      settings.enableHeartbeat
    );
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // 隐藏窗口被定时销毁时不应退出应用；只有用户真正关闭（forceQuit）才结束。
  if (forceQuit && process.platform !== 'darwin') {
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
    showWindowFromTray();
  }
});

function showWindowFromTray(): void {
  if (destroyHiddenWindowTimer) {
    clearTimeout(destroyHiddenWindowTimer);
    destroyHiddenWindowTimer = null;
  }
  if (!win || win.isDestroyed()) {
    win = createWindow?.() ?? null;
    wifiEventListener?.setWindow(win);
  }
  if (win) {
    win.show();
    win.focus();
  }
}

function scheduleHiddenWindowTeardown(delayMs: number): void {
  if (delayMs <= 0) {
    return;
  }
  if (destroyHiddenWindowTimer) {
    clearTimeout(destroyHiddenWindowTimer);
  }
  destroyHiddenWindowTimer = setTimeout(() => {
    destroyHiddenWindowTimer = null;
    if (!win || win.isDestroyed() || win.isVisible()) {
      return;
    }
    win.destroy();
    win = null;
    services?.logger.info('隐藏窗口已销毁，托盘点击时可按需重建', {
      category: 'system',
      source: 'Main',
    });
  }, delayMs);
}

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
    showWindowFromTray();
  });
}

app.whenReady().then(async () => {
  try {
    // macOS: 设置 Dock 图标（开发模式下必需）
    if (process.platform === 'darwin') {
      const dockIconPath = path.join(process.env.APP_ROOT!, 'build', 'png', '512x512.png');
      if (existsSync(dockIconPath)) app.dock?.setIcon(dockIconPath);
      devLog.info('[Main] Dock icon set to:', dockIconPath);
    }

    // 初始化服务
    const initialized = await initAppServices();
    services = initialized;
    services.configManager.subscribe((config) => {
      applyConfigChange(config);
      for (const window of BrowserWindow.getAllWindows())
        window.webContents.send('event:config:changed', config);
    });
    fileLogger = initialized.fileLogger;
    void services;

    // 创建 WiFi 切换服务
    wifiSwitcherService = new WifiSwitcherService({
      scan: runtimePorts.scan,
      connect: runtimePorts.connect,
    });
    // 配置已知网络列表（包含密码和优先级）
    const wifiConfigs = services.wifiManager.getWifiConfigs();
    wifiSwitcherService.setConfiguredNetworks(
      wifiConfigs.map((w) => ({
        ssid: w.ssid,
        password: w.password,
        priority: w.priority ?? 10,
        security: w.security,
      }))
    );

    // 注册 IPC 处理器（传递 wifiSwitcherService）
    registerAllIPC(services, wifiSwitcherService, applyConfigChange);

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
    notificationService.setEnabled(Object.values(settings.notificationSettings).some(Boolean));
    notificationService.setEventSettings(settings.notificationSettings);
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
      }, 30_000);
    }

    // 创建自动重连服务
    autoReconnectService = createAutoReconnectService(
      services.authService,
      services.accountManager,
      services.logger,
      {
        enabled: settings.autoReconnect && !settings.autoAuthPaused,
        maxRetries: 3,
        initialDelay: 2000,
        maxDelay: 30000,
        failureThreshold: settings.heartbeatFailureThreshold,
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
        onReconnectSuccess: ({ recovered }) => {
          trayService?.setStatus('connected');
          // 仅「已在线 → 掉线 → 自动重新认证成功」才算认证恢复；首次自动登录不打扰
          if (recovered) {
            notificationService?.notifyEvent('authRecovered', '认证失效后已自动重新登录');
          }
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

          // 认证重连失败属于「自动重连全部失败」场景
          notificationService?.notifyEvent(
            'reconnectFailed',
            '校园网自动认证失败，请检查账号或手动重试'
          );

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
      services.wifiManager,
      services.configManager
    );

    // 挂起恢复后路由/DHCP 可能刚变化，立即做一次轻量检测，不等完整心跳周期。
    powerMonitor.on('suspend', () => {
      services?.logger.info('系统挂起，暂停后台心跳检测');
      if (services && services.configManager.getSettings().enableHeartbeat) {
        stopBackgroundServices(services);
      }
    });

    powerMonitor.on('resume', () => {
      const resumeSettings = services?.configManager.getSettings();
      services?.logger.info('系统恢复，重启后台心跳检测');
      services?.networkDetector
        .getNetworkStatus()
        .then((status) => {
          win?.webContents.send('event:network:statusChanged', status);
        })
        .catch((error) => {
          services?.logger.error('系统恢复后的网络检测失败', error);
        });
      const pollingInterval =
        (resumeSettings?.heartbeatIntervalSeconds ?? resumeSettings?.pollingInterval ?? 30) * 1000;
      if (services && resumeSettings?.enableHeartbeat) {
        startBackgroundServices(
          services,
          pollingInterval,
          autoReconnectService ?? undefined,
          resumeSettings.enableHeartbeat
        );
      }
    });

    // 启动后台服务（带自动重连和心跳检测设置）
    const pollingInterval = heartbeatIntervalMs(settings);
    appliedSettings = settings;
    startBackgroundServices(
      services,
      pollingInterval,
      autoReconnectService,
      settings.enableHeartbeat
    );

    // 创建窗口
    const windowOptions = {
      appRoot: process.env.APP_ROOT!,
      preloadPath: path.join(MAIN_DIST, 'preload.mjs'),
      rendererDist: RENDERER_DIST,
      devServerUrl: VITE_DEV_SERVER_URL,
      shouldQuit: () => forceQuit,
      onVisibilityChange: (hidden: boolean) => {
        wifiEventListener?.setCheckInterval(
          hidden ? WIFI_CHECK_INTERVAL_BACKGROUND : WIFI_CHECK_INTERVAL_FOREGROUND
        );
        if (hidden && !IS_E2E_TEST) {
          scheduleHiddenWindowTeardown(settings.destroyHiddenWindowAfterMs ?? 120_000);
        } else if (destroyHiddenWindowTimer) {
          clearTimeout(destroyHiddenWindowTimer);
          destroyHiddenWindowTimer = null;
        }
      },
      onDidFinishLoad: async (window: BrowserWindow) => {
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
    };
    createWindow = () => createMainWindow(windowOptions);
    win = createWindow();

    if (IS_E2E_TEST) {
      services.logger.info('E2E 测试模式已启用，使用受控系统边界');
    } else {
      // 创建托盘服务
      trayService = createTrayService(iconDir, {
        onLogin: async () => {
          if (!services) return;
          trayService?.setStatus('connecting');
          const result = await manualLogin(
            services.authService,
            services.configManager,
            services.networkDetector
          ).catch((error) => ({ success: false, message: String(error) }));
          trayService?.setStatus(result.success ? 'connected' : 'disconnected');
        },
        onLogout: async () => {
          if (!services) return;
          await manualLogout(
            services.authService,
            services.configManager,
            services.networkDetector
          ).catch((error) => services?.logger.error('托盘注销失败', error));
          trayService?.setStatus('disconnected');
        },
        onShowWindow: () => {
          showWindowFromTray();
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
    }
    // 创建并启动 WiFi 事件监听器
    // 监听系统 WiFi 连接/断开事件，自动触发网络状态更新和重连；
    // 同时接入认证重连服务，WiFi 连接/切换后立即认证（快速路径）
    wifiEventListener = createWifiEventListener({
      networkDetector: services.networkDetector,
      logger: services.logger,
      window: win,
      checkInterval: WIFI_CHECK_INTERVAL_FOREGROUND, // 前台检测 SSID 变化，隐藏到托盘后自动降频
      wifiManager: services.wifiManager,
      wifiSwitcherService: wifiSwitcherService,
      configManager: services.configManager,
      autoReconnectService: autoReconnectService ?? undefined,
      notify: (kind, body) => notificationService?.notifyEvent(kind, body),
    });
    wifiEventListener.start();
    services.logger.info('WiFi 事件监听器已启动');

    services.logger.log('success', '===== 应用初始化完成 =====', {
      category: 'system',
      source: 'Main',
    });
  } catch (error) {
    devLog.error('Failed to initialize app:', error);
    if (!runtimePorts.headlessShell)
      dialog.showErrorBox(
        'NetMate 配置加载失败',
        error instanceof Error ? error.message : '请检查配置和系统钥匙串后重试'
      );
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
