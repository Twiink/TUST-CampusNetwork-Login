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
} as const;
