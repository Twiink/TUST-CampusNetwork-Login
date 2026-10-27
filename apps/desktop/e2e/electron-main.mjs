import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(currentDir, '..');
const preloadPath = path.join(appRoot, 'dist-electron', 'preload.mjs');
const rendererPath = path.join(appRoot, 'dist', 'index.html');
const { version } = require('../package.json');
const { createDefaultAppConfig, generateId, normalizeAppConfig } = require('@repo/shared');

const userDataDir = process.env.NETMATE_E2E_USER_DATA_DIR;
if (!userDataDir) {
  throw new Error('NETMATE_E2E_USER_DATA_DIR must be set by the test fixture');
}
app.setPath('userData', userDataDir);
app.setPath('sessionData', userDataDir);

const scenario = process.env.E2E_SCENARIO || 'authenticated';
const networkOffline = process.env.E2E_NETWORK_STATE === 'offline' || scenario === 'offline';

const account = {
  id: 'a1',
  name: '测试账户',
  username: '20250001',
  password: 'e2e-pass',
  serverUrl: 'http://10.10.102.50:801',
  isp: 'campus',
};

const campusWifi = {
  id: 'w1',
  ssid: 'TUST-WIFI',
  password: 'wifi-pass',
  autoConnect: true,
  requiresAuth: true,
  linkedAccountIds: ['a1'],
  linkedAccountId: 'a1',
  priority: 1,
  lastConnectedAt: null,
};

const noAuthWifi = {
  id: 'w2',
  ssid: 'Home-WIFI',
  password: '',
  autoConnect: true,
  requiresAuth: false,
  linkedAccountIds: [],
  priority: 10,
  lastConnectedAt: null,
};

function settings(overrides = {}) {
  return {
    autoLaunch: false,
    enableHeartbeat: true,
    heartbeatIntervalSeconds: 30,
    heartbeatFailureThreshold: 3,
    autoReconnect: true,
    wifiReconnectRetries: 3,
    wifiReconnectCooldownMinutes: 5,
    startupAutoConnect: false,
    keepCurrentConnection: true,
    notificationSettings: {
      wifiDisconnected: true,
      reconnectSuccess: true,
      reconnectFailed: true,
      authRecovered: true,
    },
    destroyHiddenWindowAfterMs: 120_000,
    autoUpdate: false,
    ...overrides,
  };
}

function createScenarioConfig() {
  switch (scenario) {
    case 'settings-empty':
      return createDefaultAppConfig({ settings: settings() });
    case 'offline':
      return createDefaultAppConfig({
        accounts: [account],
        currentAccountId: account.id,
        wifiList: [campusWifi],
        settings: settings(),
      });
    case 'unconfigured':
    case 'auth-required':
    case 'unlinked':
      return createDefaultAppConfig({
        accounts: scenario === 'unlinked' ? [] : [account],
        currentAccountId: scenario === 'unlinked' ? null : account.id,
        wifiList:
          scenario === 'unconfigured'
            ? []
            : [
                {
                  ...campusWifi,
                  linkedAccountIds: scenario === 'unlinked' ? [] : ['a1'],
                  linkedAccountId: scenario === 'unlinked' ? undefined : 'a1',
                },
              ],
        settings: settings(),
      });
    case 'no-auth':
      return createDefaultAppConfig({
        accounts: [account],
        currentAccountId: account.id,
        wifiList: [noAuthWifi],
        settings: settings(),
      });
    case 'multiple-wifi':
      return createDefaultAppConfig({
        accounts: [account],
        currentAccountId: account.id,
        wifiList: [
          campusWifi,
          noAuthWifi,
          {
            ...campusWifi,
            id: 'w3',
            ssid: 'TUST-Backup',
            priority: 2,
          },
        ],
        settings: settings(),
      });
    case 'authenticated':
    default:
      return createDefaultAppConfig({
        accounts: [account],
        currentAccountId: account.id,
        wifiList: [campusWifi],
        settings: settings(),
      });
  }
}

let config = createScenarioConfig();
let currentSsid = networkOffline ? null : scenario === 'no-auth' ? 'Home-WIFI' : 'TUST-WIFI';
let authenticated = !networkOffline && scenario !== 'auth-required' && scenario !== 'unlinked';
let logs = [
  { id: 'l1', level: 'warn', message: 'WiFi 信号较弱', timestamp: '2026-01-01T08:00:00.000Z' },
  { id: 'l2', level: 'success', message: '登录成功', timestamp: '2026-01-01T08:01:00.000Z' },
  { id: 'l3', level: 'info', message: '心跳检测正常', timestamp: '2026-01-01T08:02:00.000Z' },
];

const updateStatus = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  progress: 0,
  version: null,
  error: null,
};

function networkStatus() {
  if (networkOffline) {
    return { connected: false, authenticated: false, wifiConnected: false, ssid: null, ip: null };
  }

  return {
    connected: authenticated,
    authenticated,
    wifiConnected: true,
    ssid: currentSsid,
    ip: '10.1.2.3',
    requiresAuth: scenario !== 'no-auth',
    isConfigured: scenario !== 'unconfigured',
    hasLinkedAccount: scenario !== 'unlinked',
  };
}

function updateConfig(nextConfig) {
  config = normalizeAppConfig(nextConfig);
  return config;
}

function currentAccount() {
  return config.accounts.find((item) => item.id === config.currentAccountId) || null;
}

function removeAccount(id) {
  const accounts = config.accounts.filter((item) => item.id !== id);
  const wifiList = config.wifiList.map((wifi) => {
    const linkedAccountIds = wifi.linkedAccountIds.filter((accountId) => accountId !== id);
    return { ...wifi, linkedAccountIds, linkedAccountId: linkedAccountIds[0] };
  });
  updateConfig({
    ...config,
    accounts,
    wifiList,
    currentAccountId:
      config.currentAccountId === id ? (accounts[0]?.id ?? null) : config.currentAccountId,
  });
}

function registerIpcHandlers() {
  ipcMain.handle('app:version', () => version);
  ipcMain.handle('app:quit', () => {
    setImmediate(() => app.quit());
    return true;
  });
  ipcMain.handle('update:status', () => updateStatus);
  ipcMain.handle('update:check', () => true);
  ipcMain.handle('update:download', () => true);
  ipcMain.handle('update:install', () => true);

  ipcMain.handle('config:get', () => config);
  ipcMain.handle('config:set', (_, nextConfig) => {
    updateConfig(nextConfig);
    return true;
  });
  ipcMain.handle('config:reset', () => {
    config = createScenarioConfig();
    return config;
  });
  ipcMain.handle('settings:get', () => config.settings);
  ipcMain.handle('settings:update', (_, updates) => {
    updateConfig({ ...config, settings: { ...config.settings, ...updates } });
    return config.settings;
  });

  ipcMain.handle('account:list', () => config.accounts);
  ipcMain.handle('account:getCurrent', () => currentAccount());
  ipcMain.handle('account:add', (_, newAccount) => {
    const created = { ...newAccount, id: generateId() };
    updateConfig({
      ...config,
      accounts: [...config.accounts, created],
      currentAccountId: config.currentAccountId || created.id,
    });
    return created;
  });
  ipcMain.handle('account:update', (_, id, updates) => {
    const existing = config.accounts.find((item) => item.id === id);
    const updated = { ...existing, ...updates, id };
    updateConfig({
      ...config,
      accounts: config.accounts.map((item) => (item.id === id ? updated : item)),
    });
    return updated;
  });
  ipcMain.handle('account:remove', (_, id) => {
    removeAccount(id);
  });
  ipcMain.handle('account:switch', (_, id) => {
    updateConfig({ ...config, currentAccountId: id });
    return currentAccount();
  });

  ipcMain.handle('wifi:list', () => config.wifiList);
  ipcMain.handle('wifi:add', (_, wifi) => {
    const created = { ...wifi, id: generateId() };
    updateConfig({ ...config, wifiList: [...config.wifiList, created] });
    return created;
  });
  ipcMain.handle('wifi:update', (_, id, updates) => {
    const existing = config.wifiList.find((item) => item.id === id);
    const updated = { ...existing, ...updates, id };
    updateConfig({
      ...config,
      wifiList: config.wifiList.map((item) => (item.id === id ? updated : item)),
    });
    return updated;
  });
  ipcMain.handle('wifi:remove', (_, id) => {
    updateConfig({ ...config, wifiList: config.wifiList.filter((item) => item.id !== id) });
  });

  ipcMain.handle('network:status', () => networkStatus());
  ipcMain.handle('network:info', () =>
    networkOffline
      ? { ipv4: null, ipv6: null, mac: null }
      : { ipv4: '10.1.2.3', ipv6: null, mac: '00:11:22:33:44:55' }
  );
  ipcMain.handle('network:check', () => authenticated);
  ipcMain.handle('wifi:currentSsid', () => ({
    connected: !networkOffline,
    ssid: currentSsid,
  }));
  ipcMain.handle('wifi:fullInfo', () => ({
    ssid: currentSsid,
    signalStrength: 80,
    linkSpeed: 866,
    frequency: 2400,
    connected: !networkOffline,
  }));
  ipcMain.handle('wifi:switch', (_, ssid) => {
    if (networkOffline || !config.wifiList.some((wifi) => wifi.ssid === ssid)) {
      return false;
    }
    currentSsid = ssid;
    return true;
  });
  ipcMain.handle('wifi:scan', () =>
    config.wifiList.map((wifi, index) => ({
      ssid: wifi.ssid,
      signalStrength: 90 - index,
      security: 'WPA2',
    }))
  );

  ipcMain.handle('auth:login', () => {
    authenticated = true;
    return { success: true, message: '登录成功' };
  });
  ipcMain.handle('auth:logout', () => {
    authenticated = false;
    return { success: true, message: '已断开连接' };
  });

  ipcMain.handle('log:get', () => [...logs]);
  ipcMain.handle('log:clear', () => {
    logs = [];
    return true;
  });
  ipcMain.handle('log:export', () => 'E2E log export');
  ipcMain.handle('log:exportSave', () => ({ success: true, path: '/tmp/netmate-e2e.log' }));
  ipcMain.handle('log:openDir', () => ({ success: true, path: '/tmp' }));

  ipcMain.handle('notification:getEnabled', () =>
    Object.values(config.settings.notificationSettings).some(Boolean)
  );
  ipcMain.handle('notification:show', () => true);
  ipcMain.handle('notification:setEnabled', () => true);
  ipcMain.handle('autoLaunch:get', () => config.settings.autoLaunch);
  ipcMain.handle('autoLaunch:set', () => true);
  ipcMain.handle('tray:getStatus', () => 'normal');
}

function createWindow() {
  const window = new BrowserWindow({
    width: 880,
    height: 670,
    show: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void window.loadFile(rendererPath);
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
