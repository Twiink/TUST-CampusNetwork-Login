/**
 * 认证相关 IPC 处理
 */

import { ipcMain, BrowserWindow } from 'electron';
import {
  AuthService,
  ConfigManager,
  AccountManager,
  createLogger,
  LoginConfig,
  LoginResult,
} from '@repo/shared';
import { getNetworkInfo } from '../services/network';
import { IPC_CHANNELS, IPC_EVENTS } from './channels';

/**
 * 注册认证 IPC 处理器
 */
export function registerAuthIPC(
  authService: AuthService,
  _configManager: ConfigManager,
  accountManager: AccountManager,
  logger: ReturnType<typeof createLogger>
) {
  /**
   * 登录
   */
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (event): Promise<LoginResult> => {
    try {
      const currentAccount = accountManager.getCurrentAccount();
      if (!currentAccount) {
        logger.error('登录失败：未选择账户');
        return { success: false, message: '请先选择或添加账户' };
      }

      const networkInfo = getNetworkInfo();
      if (!networkInfo.ipv4) {
        logger.error('登录失败：无法获取 IP 地址');
        return { success: false, message: '无法获取本机 IP 地址' };
      }

      logger.info(`开始登录: ${currentAccount.username}`);

      // 通知渲染进程状态变化
      const win = BrowserWindow.fromWebContents(event.sender);
      win?.webContents.send(IPC_EVENTS.AUTH_STATUS_CHANGED, 'authenticating');

      const loginConfig: LoginConfig = {
        serverUrl: currentAccount.serverUrl,
        userAccount: currentAccount.username,
        userPassword: currentAccount.password,
        wlanUserIp: networkInfo.ipv4,
        wlanUserIpv6: networkInfo.ipv6 || undefined,
        wlanUserMac: networkInfo.mac || undefined,
        isp: currentAccount.isp,
      };

      authService.setServerUrl(currentAccount.serverUrl);
      const result = await authService.login(loginConfig);

      if (result.success) {
        logger.success(`登录成功: ${result.message}`);
        win?.webContents.send(IPC_EVENTS.AUTH_STATUS_CHANGED, 'authenticated');
      } else {
        logger.error(`登录失败: ${result.message}`);
        win?.webContents.send(IPC_EVENTS.AUTH_STATUS_CHANGED, 'failed');
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      logger.error(`登录异常: ${message}`);
      return { success: false, message };
    }
  });

  /**
   * 登出
   */
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (event) => {
    try {
      const networkInfo = getNetworkInfo();
      if (!networkInfo.ipv4) {
        logger.error('登出失败：无法获取 IP 地址');
        return { success: false, message: '无法获取本机 IP 地址' };
      }

      logger.info('开始登出');

      const result = await authService.logout(networkInfo.ipv4);

      if (result.success) {
        logger.info('登出成功');
        const win = BrowserWindow.fromWebContents(event.sender);
        win?.webContents.send(IPC_EVENTS.AUTH_STATUS_CHANGED, 'idle');
      } else {
        logger.warn(`登出失败: ${result.message}`);
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      logger.error(`登出异常: ${message}`);
      return { success: false, message };
    }
  });
}
