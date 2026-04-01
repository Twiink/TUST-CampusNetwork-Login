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

const updateStatus = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  progress: 0,
  version: null,
  error: null,
};

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
