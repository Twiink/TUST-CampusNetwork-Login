/**
 * IPC 通道名称定义
 */

export const IPC_CHANNELS = {
  // 认证相关
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_STATUS: 'auth:status',

  // 配置相关
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_RESET: 'config:reset',

  // 账户相关
  ACCOUNT_LIST: 'account:list',
  ACCOUNT_GET_CURRENT: 'account:getCurrent',
  ACCOUNT_ADD: 'account:add',
  ACCOUNT_UPDATE: 'account:update',
  ACCOUNT_REMOVE: 'account:remove',
  ACCOUNT_SWITCH: 'account:switch',

  // WiFi 相关
  WIFI_LIST: 'wifi:list',
  WIFI_ADD: 'wifi:add',
  WIFI_UPDATE: 'wifi:update',
  WIFI_REMOVE: 'wifi:remove',
  WIFI_CURRENT_SSID: 'wifi:currentSsid', // 获取当前 WiFi SSID
  WIFI_FULL_INFO: 'wifi:fullInfo', // 获取完整网络信息（含 WiFi）
  WIFI_SWITCH: 'wifi:switch', // 切换到指定 WiFi
  WIFI_SCAN: 'wifi:scan', // 扫描可用 WiFi 网络

  // 网络相关
  NETWORK_STATUS: 'network:status',
  NETWORK_INFO: 'network:info',
  NETWORK_CHECK: 'network:check',

  // 日志相关
  LOG_GET: 'log:get',
  LOG_CLEAR: 'log:clear',
  LOG_EXPORT: 'log:export',

  // 设置相关
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  // 应用相关
  APP_VERSION: 'app:version',
  APP_QUIT: 'app:quit',

  // 托盘相关
  TRAY_SET_STATUS: 'tray:setStatus',
  TRAY_GET_STATUS: 'tray:getStatus',

  // 开机自启相关
  AUTO_LAUNCH_GET: 'autoLaunch:get',
  AUTO_LAUNCH_SET: 'autoLaunch:set',

  // 通知相关
  NOTIFICATION_SHOW: 'notification:show',
  NOTIFICATION_GET_ENABLED: 'notification:getEnabled',
  NOTIFICATION_SET_ENABLED: 'notification:setEnabled',

  // 更新相关
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status',
} as const;

/**
 * IPC 事件名称 (从主进程推送到渲染进程)
 */
export const IPC_EVENTS = {
  // 网络状态变化
  NETWORK_STATUS_CHANGED: 'event:network:statusChanged',
  // 日志更新
  LOG_ADDED: 'event:log:added',
  // 认证状态变化
  AUTH_STATUS_CHANGED: 'event:auth:statusChanged',
  // 更新状态变化
  UPDATE_STATUS_CHANGED: 'event:update:statusChanged',
} as const;
