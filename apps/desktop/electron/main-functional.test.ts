// Execute main.ts + the actual auth/config IPC registrations with controlled OS boundaries.
import type { AppServices } from './ipc';
import { expect, it, vi } from 'vitest';
import {
  AccountManager,
  AuthService,
  ConfigManager,
  MemoryStorageAdapter,
  WifiManager,
  createDefaultAppConfig,
  createLogger,
} from '@repo/shared';

const boundary = vi.hoisted(() => ({
  services: null as unknown as AppServices & { fileLogger: { close: () => void } },
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  background: vi.fn(),
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
  createUpdaterService: () => ({ checkForUpdates: vi.fn() }),
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

it('main entry updates tray after renderer login and rolls back only rejected OS autostart', async () => {
  vi.stubEnv('VITE_DEV_SERVER_URL', 'http://fixture.invalid');
  const storage = new MemoryStorageAdapter();
  const config = new ConfigManager(storage);
  await config.load();
  await config.save(
    createDefaultAppConfig({
      accounts: [
        {
          id: 'one',
          name: 'fixture',
          username: 'fixture',
          password: 'fixture-only',
          isp: 'campus',
          serverUrl: 'http://192.0.2.10:801',
        },
      ],
      currentAccountId: 'one',
      wifiList: [
        {
          id: 'wifi',
          ssid: 'Campus',
          password: '',
          security: 'Open',
          autoConnect: true,
          requiresAuth: true,
          linkedAccountIds: ['one'],
          priority: 1,
          lastConnectedAt: null,
        },
      ],
    })
  );
  const logger = createLogger();
  let online = true;
  const auth = new AuthService();
  vi.spyOn(auth, 'loginWithAccounts').mockResolvedValue({
    success: true,
    message: 'ok',
    attempts: [],
  });
  boundary.services = {
    configManager: config,
    authService: auth,
    logger,
    storage,
    accountManager: new AccountManager(config, logger),
    wifiManager: new WifiManager(config, logger),
    networkDetector: {
      getNetworkStatus: async () => ({
        wifiConnected: true,
        ssid: 'Campus',
        security: 'Open',
        ip: '10.1.2.3',
        connected: online,
        authenticated: online,
      }),
    },
    fileLogger: { close: vi.fn() },
  } as unknown as typeof boundary.services;
  const enableOS = vi.fn().mockRejectedValue(new Error('fixture OS registration denied'));
  runtimePorts.autoLaunch = { isEnabled: async () => false, enable: enableOS, disable: vi.fn() };
  await import('./main');
  await vi.waitFor(() =>
    expect(logger.getLogs().some((entry) => entry.message.includes('应用初始化完成'))).toBe(true)
  );
  expect(boundary.tray.init).toHaveBeenCalled();
  expect(boundary.tray.setStatus).toHaveBeenLastCalledWith('connected');

  const result = await boundary.handlers.get(IPC_CHANNELS.AUTH_LOGIN)!({ sender: {} });
  expect(result).toMatchObject({ success: true });
  const autoReconnect = boundary.background.mock.calls[0][2];
  await autoReconnect.handleStatusChange({
    connected: true,
    authenticated: true,
    wifiConnected: true,
    requiresAuth: true,
    ssid: 'Campus',
    security: 'Open',
    ip: '10.1.2.3',
  });
  expect(boundary.tray.setStatus).toHaveBeenCalledWith('connected');

  vi.spyOn(auth, 'logout')
    .mockResolvedValueOnce({ success: false, message: 'rejected' })
    .mockImplementation(async () => {
      online = false;
      return { success: true, message: 'ok' };
    });
  await boundary.handlers.get(IPC_CHANNELS.AUTH_LOGOUT)!({ sender: {} });
  expect(boundary.tray.setStatus).toHaveBeenLastCalledWith('connected');
  await boundary.handlers.get(IPC_CHANNELS.AUTH_LOGOUT)!({ sender: {} });
  expect(boundary.tray.setStatus).toHaveBeenLastCalledWith('disconnected');
  const next = config.getConfig()!;
  next.settings.autoLaunch = true;
  next.settings.enableHeartbeat = false;
  const saved = await boundary.handlers.get(IPC_CHANNELS.CONFIG_SET)!({}, next);
  expect(enableOS).toHaveBeenCalledTimes(1);
  expect(saved).toMatchObject({
    applied: false,
    config: { settings: { autoLaunch: false, enableHeartbeat: false } },
  });
  expect(config.getSettings().autoLaunch).toBe(false);
  expect(logger.getLogs().some((entry) => entry.message.includes('同步开机自启失败'))).toBe(false);
  vi.useFakeTimers();
  runtimePorts.hiddenWindowDelayMs = 25;
  boundary.visible = false;
  boundary.visibility!(true);
  await vi.advanceTimersByTimeAsync(25);
  expect(boundary.win.destroy).toHaveBeenCalledTimes(1);
  expect(boundary.destroyed).toBe(true);
  boundary.events.get('activate')!();
  expect(boundary.destroyed).toBe(false);
  expect(boundary.visible).toBe(true);
  delete runtimePorts.hiddenWindowDelayMs;
  vi.useRealTimers();
  logger.stopAutoCleanup();
  delete runtimePorts.autoLaunch;
  vi.unstubAllEnvs();
});
