// Execute main.ts + the actual auth/config IPC registrations with controlled OS boundaries.
import type { AppServices } from './ipc';
import { expect, it, vi } from 'vitest';
import {
  AccountManager,
  AuthService,
  ConfigManager,
  MemoryStorageAdapter,
  WifiManager,
  createLogger,
} from '@repo/shared';

const boundary = vi.hoisted(() => ({
  services: null as unknown as AppServices & { fileLogger: { close: () => void } },
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  background: vi.fn(),
  updateCheck: vi.fn().mockResolvedValue(undefined),
  events: new Map<string, () => void>(),
  visibility: null as ((hidden: boolean) => void) | null,
  visible: true,
  destroyed: false,
  tray: { init: vi.fn(() => true), setStatus: vi.fn(), destroy: vi.fn() },
  win: {
    webContents: { send: vi.fn() },
    isDestroyed: () => boundary.destroyed,
    isVisible: () => boundary.visible,
    show: vi.fn(() => {
      boundary.visible = true;
    }),
    focus: vi.fn(),
    destroy: vi.fn(() => {
      boundary.destroyed = true;
    }),
  },
}));
vi.mock('electron', () => ({
  app: {
    on: (event: string, listener: () => void) => boundary.events.set(event, listener),
    whenReady: () => Promise.resolve(),
    requestSingleInstanceLock: () => true,
    getPath: () => '/fixture/NetMate',
    quit: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: () => (boundary.destroyed ? [] : [boundary.win]),
    fromWebContents: () => boundary.win,
  },
  powerMonitor: { on: vi.fn() },
  dialog: { showErrorBox: vi.fn() },
  ipcMain: {
    handle: (key: string, handler: (...args: unknown[]) => Promise<unknown>) =>
      boundary.handlers.set(key, handler),
  },
}));
vi.mock('./main-services', () => ({ initAppServices: async () => boundary.services }));
vi.mock('./main-window', () => ({
  createMainWindow: (options: {
    onVisibilityChange: (hidden: boolean) => void;
    onDidFinishLoad: (win: typeof boundary.win) => Promise<void>;
  }) => {
    boundary.visibility = options.onVisibilityChange;
    boundary.destroyed = false;
    void options.onDidFinishLoad(boundary.win);
    return boundary.win;
  },
}));
vi.mock('./services/tray', () => ({ createTrayService: () => boundary.tray }));
vi.mock('./services/notification', () => ({
  createNotificationService: () => ({
    setEnabled: vi.fn(),
    setEventSettings: vi.fn(),
    notifyEvent: vi.fn(),
    showUpdateAvailable: vi.fn(),
  }),
}));
vi.mock('./services/updater', () => ({
  createUpdaterService: () => ({ checkForUpdates: boundary.updateCheck }),
}));
vi.mock('./services/wifi-switcher', () => ({
  WifiSwitcherService: class {
    setConfiguredNetworks() {}
  },
}));
vi.mock('./services/wifi-event-listener', () => ({
  createWifiEventListener: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    resetCooldown: vi.fn(),
    setWindow: vi.fn(),
    setCheckInterval: vi.fn(),
    whenInitialized: async () => undefined,
  }),
}));
vi.mock('./services/wifi-detector', () => ({
  getCurrentWifiSSID: async () => ({ ssid: 'Campus', connected: true }),
}));
vi.mock('./ipc', async () => {
  const { registerAuthIPC } = await import('./ipc/auth');
  const { registerConfigIPC } = await import('./ipc/config');
  return {
    registerAllIPC: (
      ...[services, _switcher, onConfigChanged, autoLaunch, publish]: Parameters<
        typeof import('./ipc').registerAllIPC
      >
    ) => {
      registerAuthIPC(
        services.authService,
        services.configManager,
        services.accountManager,
        services.logger,
        services.networkDetector,
        publish
      );
      return registerConfigIPC(
        services.configManager,
        services.logger,
        onConfigChanged,
        autoLaunch
      );
    },
    registerTrayIPC: vi.fn(),
    registerAutoLaunchIPC: vi.fn(),
    registerNotificationIPC: vi.fn(),
    registerUpdaterIPC: vi.fn(),
    startBackgroundServices: boundary.background,
    stopBackgroundServices: vi.fn(),
  };
});
import { runtimePorts } from './runtime-ports';
import { IPC_CHANNELS } from './ipc/channels';

it('N7: 关闭取消检查，重新开启从保存时计时且只安排一次', async () => {
  vi.useFakeTimers();
  vi.stubEnv('VITE_DEV_SERVER_URL', '');
  const storage = new MemoryStorageAdapter();
  const config = new ConfigManager(storage);
  await config.load();
  expect(config.getSettings().autoUpdate).toBe(true);
  const logger = createLogger();
  const auth = new AuthService();
  boundary.services = {
    configManager: config,
    authService: auth,
    logger,
    storage,
    accountManager: new AccountManager(config, logger),
    wifiManager: new WifiManager(config, logger),
    networkDetector: {
      getNetworkStatus: async () => ({
        wifiConnected: false,
        connected: false,
        authenticated: false,
      }),
    },
    fileLogger: { close: vi.fn() },
  } as unknown as typeof boundary.services;
  runtimePorts.autoLaunch = { isEnabled: async () => false, enable: vi.fn(), disable: vi.fn() };
  await import('./main');
  await vi.waitFor(() =>
    expect(logger.getLogs().some((entry) => entry.message.includes('应用初始化完成'))).toBe(true)
  );
  const next = config.getConfig()!;
  next.settings.autoUpdate = false;
  const saved = await boundary.handlers.get(IPC_CHANNELS.CONFIG_SET)!({}, next);
  expect(saved).toMatchObject({ applied: true, config: { settings: { autoUpdate: false } } });
  expect(boundary.updateCheck).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(30000);
  expect(config.getSettings().autoUpdate).toBe(false);
  expect(boundary.updateCheck).not.toHaveBeenCalled();
  const enabled = config.getConfig()!;
  enabled.settings.autoUpdate = true;
  await boundary.handlers.get(IPC_CHANNELS.CONFIG_SET)!({}, enabled);
  await vi.advanceTimersByTimeAsync(29_999);
  expect(boundary.updateCheck).not.toHaveBeenCalled();
  const unrelated = config.getConfig()!;
  unrelated.settings.enableHeartbeat = false;
  await boundary.handlers.get(IPC_CHANNELS.CONFIG_SET)!({}, unrelated);
  await vi.advanceTimersByTimeAsync(1);
  expect(boundary.updateCheck).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(boundary.updateCheck).toHaveBeenCalledTimes(1);
  logger.stopAutoCleanup();
  delete runtimePorts.autoLaunch;
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
