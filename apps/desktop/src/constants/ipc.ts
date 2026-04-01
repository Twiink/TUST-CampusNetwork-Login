/**
 * 渲染进程可用的 IPC 事件常量
 */

export const IPC_EVENTS = {
  NETWORK_STATUS_CHANGED: 'event:network:statusChanged',
  NETWORK_STATUS_LOADING: 'event:network:statusLoading',
  LOG_ADDED: 'event:log:added',
  AUTH_STATUS_CHANGED: 'event:auth:statusChanged',
  UPDATE_STATUS_CHANGED: 'event:update:statusChanged',
  WIFI_RECONNECT_PROGRESS: 'event:wifi:reconnectProgress',
  WIFI_ALL_RECONNECTS_FAILED: 'event:wifi:allReconnectsFailed',
} as const;
