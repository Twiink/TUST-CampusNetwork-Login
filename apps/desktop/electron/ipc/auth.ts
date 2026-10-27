import { ipcMain, BrowserWindow } from 'electron';
import {
  type AuthService,
  type ConfigManager,
  type AccountManager,
  type NetworkDetector,
  type Logger,
} from '@repo/shared';
import { manualLogin, manualLogout } from '../services/auth-session';
import { IPC_CHANNELS, IPC_EVENTS } from './channels';

export function registerAuthIPC(
  auth: AuthService,
  config: ConfigManager,
  _accounts: AccountManager,
  logger: Logger,
  detector?: NetworkDetector
) {
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.webContents.send(IPC_EVENTS.AUTH_STATUS_CHANGED, 'authenticating');
    try {
      const result = await manualLogin(auth, config, detector);
      win?.webContents.send(
        IPC_EVENTS.AUTH_STATUS_CHANGED,
        result.success ? 'authenticated' : 'failed'
      );
      return result;
    } catch (error) {
      logger.error('手动认证失败', error);
      win?.webContents.send(IPC_EVENTS.AUTH_STATUS_CHANGED, 'failed');
      return { success: false, message: error instanceof Error ? error.message : '认证失败' };
    }
  });
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (event) => {
    try {
      const result = await manualLogout(auth, config, detector);
      BrowserWindow.fromWebContents(event.sender)?.webContents.send(
        IPC_EVENTS.AUTH_STATUS_CHANGED,
        'idle'
      );
      return result;
    } catch (error) {
      logger.error('注销失败，自动认证保持暂停', error);
      return { success: false, message: error instanceof Error ? error.message : '注销失败' };
    }
  });
}
