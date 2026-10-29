import { ipcMain, BrowserWindow } from 'electron';
import {
  type AuthService,
  type ConfigManager,
  type AccountManager,
  type NetworkDetector,
  type Logger,
  type NetworkStatus,
} from '@repo/shared';
import { manualLogin, manualLogout } from '../services/auth-session';
import { IPC_CHANNELS, IPC_EVENTS } from './channels';

export function registerAuthIPC(
  auth: AuthService,
  config: ConfigManager,
  _accounts: AccountManager,
  logger: Logger,
  detector?: NetworkDetector,
  publish?: (status: NetworkStatus | 'connecting') => void
) {
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    publish?.('connecting');
    if (win && !win.isDestroyed())
      win.webContents.send(IPC_EVENTS.AUTH_STATUS_CHANGED, 'authenticating');
    try {
      const result = await manualLogin(auth, config, detector);
      const status = await detector?.getNetworkStatus({ fresh: true });
      if (status)
        publish?.(
          result.success && !result.cancelled
            ? { ...status, authenticated: true, internetReachable: status.connected }
            : status
        );
      if (win && !win.isDestroyed())
        win.webContents.send(
          IPC_EVENTS.AUTH_STATUS_CHANGED,
          result.cancelled ? 'idle' : result.success ? 'authenticated' : 'failed'
        );
      return result;
    } catch (error) {
      logger.error('手动认证失败', error);
      if (win && !win.isDestroyed()) win.webContents.send(IPC_EVENTS.AUTH_STATUS_CHANGED, 'failed');
      const status = await detector?.getNetworkStatus({ fresh: true });
      if (status) publish?.(status);
      return { success: false, message: error instanceof Error ? error.message : '认证失败' };
    }
  });
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (event) => {
    try {
      const result = await manualLogout(auth, config, detector);
      const status = await detector?.getNetworkStatus({ fresh: true });
      if (status)
        publish?.(result.success ? { ...status, connected: false, authenticated: false } : status);
      const win = BrowserWindow.fromWebContents(event.sender);
      if (result.success && win && !win.isDestroyed())
        win.webContents.send(IPC_EVENTS.AUTH_STATUS_CHANGED, 'idle');
      return result;
    } catch (error) {
      logger.error('注销失败，自动认证保持暂停', error);
      return { success: false, message: error instanceof Error ? error.message : '注销失败' };
    }
  });
}
