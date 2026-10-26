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

const userDataDir = process.env.NETMATE_E2E_USER_DATA_DIR;
if (!userDataDir) {
  throw new Error('NETMATE_E2E_USER_DATA_DIR must be set by the test fixture');
}
app.setPath('userData', userDataDir);
app.setPath('sessionData', userDataDir);

const updateStatus = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  progress: 0,
  version: null,
  error: null,
};

// E2E 场景开关：E2E_NETWORK_STATE=offline 模拟 WiFi 未连接
const networkOffline = process.env.E2E_NETWORK_STATE === 'offline';

const networkStatus = networkOffline
  ? { connected: false, authenticated: false, wifiConnected: false, ssid: null, ip: null }
  : {
      connected: true,
      authenticated: true,
      wifiConnected: true,
      ssid: 'TUST-WIFI',
      ip: '10.1.2.3',
      requiresAuth: true,
      isConfigured: true,
      hasLinkedAccount: true,
    };

const initialConfig = {
  accounts: [
    {
      id: 'a1',
      name: '测试账户',
      username: '20250001',
      password: 'e2e-pass',
      serverUrl: 'http://10.10.102.50:801',
      isp: 'campus',
    },
  ],
  currentAccountId: 'a1',
  wifiList: [],
  settings: {
    autoLaunch: false,
    enableHeartbeat: false,
    autoReconnect: true,
    showNotification: true,
    pollingInterval: 30,
    maxRetries: 3,
  },
};

const logEntries = [
  { id: 'l1', level: 'warn', message: 'WiFi 信号较弱', timestamp: '2026-01-01T08:00:00.000Z' },
  { id: 'l2', level: 'success', message: '登录成功', timestamp: '2026-01-01T08:01:00.000Z' },
  { id: 'l3', level: 'info', message: '心跳检测正常', timestamp: '2026-01-01T08:02:00.000Z' },
];

function registerIpcHandlers() {
  ipcMain.handle('app:version', () => version);
  ipcMain.handle('app:quit', () => {
    app.quit();
    return true;
  });
  ipcMain.handle('update:status', () => updateStatus);
  ipcMain.handle('update:check', () => false);
  ipcMain.handle('update:download', () => false);
  ipcMain.handle('update:install', () => false);

  ipcMain.handle('config:get', () => initialConfig);
  ipcMain.handle('config:set', () => true);
  ipcMain.handle('config:reset', () => initialConfig);
  ipcMain.handle('settings:get', () => initialConfig.settings);
  ipcMain.handle('settings:update', () => initialConfig.settings);

  ipcMain.handle('account:list', () => initialConfig.accounts);
  ipcMain.handle('account:getCurrent', () => initialConfig.accounts[0]);

  ipcMain.handle('wifi:list', () => initialConfig.wifiList);

  ipcMain.handle('network:status', () => networkStatus);
  ipcMain.handle('network:info', () =>
    networkOffline
      ? { ipv4: null, ipv6: null, mac: null }
      : { ipv4: '10.1.2.3', ipv6: null, mac: '00:11:22:33:44:55' }
  );
  ipcMain.handle('network:check', () => true);
  // 渲染进程 useNetwork 期待 {connected, ssid} 形状（WifiStatus）
  ipcMain.handle('wifi:currentSsid', () =>
    networkOffline ? { connected: false, ssid: null } : { connected: true, ssid: 'TUST-WIFI' }
  );
  ipcMain.handle('wifi:fullInfo', () => ({
    ssid: networkOffline ? null : 'TUST-WIFI',
    signalStrength: 80,
    linkSpeed: 866,
    frequency: 2400,
    connected: !networkOffline,
  }));

  ipcMain.handle('log:get', () => logEntries);
  ipcMain.handle('log:clear', () => true);

  ipcMain.handle('notification:getEnabled', () => true);
  ipcMain.handle('autoLaunch:get', () => false);
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
