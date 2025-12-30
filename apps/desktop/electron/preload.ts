import { ipcRenderer, contextBridge } from 'electron';

/**
 * IPC 通道名称 (与主进程保持一致)
 */
const IPC_CHANNELS = {
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_STATUS: 'auth:status',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_RESET: 'config:reset',
  ACCOUNT_LIST: 'account:list',
  ACCOUNT_GET_CURRENT: 'account:getCurrent',
  ACCOUNT_ADD: 'account:add',
  ACCOUNT_UPDATE: 'account:update',
  ACCOUNT_REMOVE: 'account:remove',
  ACCOUNT_SWITCH: 'account:switch',
  WIFI_LIST: 'wifi:list',
  WIFI_ADD: 'wifi:add',
  WIFI_UPDATE: 'wifi:update',
  WIFI_REMOVE: 'wifi:remove',
  WIFI_CURRENT_SSID: 'wifi:currentSsid',
  WIFI_FULL_INFO: 'wifi:fullInfo',
  NETWORK_STATUS: 'network:status',
  NETWORK_INFO: 'network:info',
  NETWORK_CHECK: 'network:check',
  LOG_GET: 'log:get',
  LOG_CLEAR: 'log:clear',
  LOG_EXPORT: 'log:export',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  APP_VERSION: 'app:version',
  APP_QUIT: 'app:quit',
  AUTO_LAUNCH_GET: 'autoLaunch:get',
  AUTO_LAUNCH_SET: 'autoLaunch:set',
  NOTIFICATION_SHOW: 'notification:show',
  NOTIFICATION_GET_ENABLED: 'notification:getEnabled',
  NOTIFICATION_SET_ENABLED: 'notification:setEnabled',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status',
} as const;

const IPC_EVENTS = {
  NETWORK_STATUS_CHANGED: 'event:network:statusChanged',
  LOG_ADDED: 'event:log:added',
  AUTH_STATUS_CHANGED: 'event:auth:statusChanged',
  UPDATE_STATUS_CHANGED: 'event:update:statusChanged',
} as const;

/**
 * 暴露给渲染进程的 API
 */
const electronAPI = {
  // 认证
  auth: {
    login: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
  },

  // 配置
  config: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),
    set: (config: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, config),
    reset: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_RESET),
  },

  // 账户
  account: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_LIST),
    getCurrent: () => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_GET_CURRENT),
    add: (account: unknown) => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_ADD, account),
    update: (id: string, updates: unknown) => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_UPDATE, id, updates),
    remove: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_REMOVE, id),
    switch: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.ACCOUNT_SWITCH, id),
  },

  // WiFi
  wifi: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.WIFI_LIST),
    add: (wifi: unknown) => ipcRenderer.invoke(IPC_CHANNELS.WIFI_ADD, wifi),
    update: (id: string, updates: unknown) => ipcRenderer.invoke(IPC_CHANNELS.WIFI_UPDATE, id, updates),
    remove: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WIFI_REMOVE, id),
  },

  // 网络
  network: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.NETWORK_STATUS),
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.NETWORK_INFO),
    check: () => ipcRenderer.invoke(IPC_CHANNELS.NETWORK_CHECK),
    getWifiSSID: () => ipcRenderer.invoke(IPC_CHANNELS.WIFI_CURRENT_SSID),
    getFullInfo: () => ipcRenderer.invoke(IPC_CHANNELS.WIFI_FULL_INFO),
  },

  // 日志
  log: {
    get: (options?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.LOG_GET, options),
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.LOG_CLEAR),
    export: (format?: 'text' | 'json') => ipcRenderer.invoke(IPC_CHANNELS.LOG_EXPORT, format),
  },

  // 设置
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (settings: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, settings),
  },

  // 开机自启
  autoLaunch: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.AUTO_LAUNCH_GET),
    set: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.AUTO_LAUNCH_SET, enabled),
  },

  // 系统通知
  notification: {
    show: (options: { title: string; body: string; type?: string; silent?: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_SHOW, options),
    getEnabled: () => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_GET_ENABLED),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_SET_ENABLED, enabled),
  },

  // 自动更新
  update: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
    download: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_STATUS),
  },

  // 事件监听
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = Object.values(IPC_EVENTS);
    if (validChannels.includes(channel as typeof validChannels[number])) {
      const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
    return () => {};
  },

  // 移除事件监听
  off: (channel: string, callback?: (...args: unknown[]) => void) => {
    const validChannels = Object.values(IPC_EVENTS);
    if (validChannels.includes(channel as typeof validChannels[number])) {
      if (callback) {
        ipcRenderer.removeListener(channel, callback);
      } else {
        ipcRenderer.removeAllListeners(channel);
      }
    }
  },
};

// 暴露到 window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// 导出类型
export type ElectronAPI = typeof electronAPI;
