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
    logger.log('info', 'IPC请求：用户登录', { category: 'auth', source: 'IPC:Auth' });

    try {
      const currentAccount = accountManager.getCurrentAccount();
      if (!currentAccount) {
        logger.log('error', 'IPC错误：登录失败，未选择账户', { category: 'auth', source: 'IPC:Auth' });
        return { success: false, message: '请先选择或添加账户' };
      }

      const networkInfo = getNetworkInfo();
      if (!networkInfo.ipv4) {
        logger.log('error', 'IPC错误：登录失败，无法获取IP地址', { category: 'auth', source: 'IPC:Auth' });
        return { success: false, message: '无法获取本机 IP 地址' };
      }

      logger.log('info', `IPC处理：开始登录`, {
        category: 'auth',
        source: 'IPC:Auth',
        data: {
          账户: currentAccount.username,
          运营商: currentAccount.isp,
          IP: networkInfo.ipv4,
        },
      });

      // 通知渲染进程状态变化
      const win = BrowserWindow.fromWebContents(event.sender);
      win?.webContents.send(IPC_EVENTS.AUTH_STATUS_CHANGED, 'authenticating');
      logger.debug('IPC事件：发送认证状态变化 - authenticating');

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
        logger.log('success', `IPC响应：登录成功 - ${result.message}`, { category: 'auth', source: 'IPC:Auth' });
        win?.webContents.send(IPC_EVENTS.AUTH_STATUS_CHANGED, 'authenticated');
      } else {
        logger.log('error', `IPC响应：登录失败 - ${result.message}`, { category: 'auth', source: 'IPC:Auth' });
        win?.webContents.send(IPC_EVENTS.AUTH_STATUS_CHANGED, 'failed');
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      logger.log('error', `IPC异常：登录过程异常`, {
        category: 'auth',
        source: 'IPC:Auth',
        data: { 错误: message },
      });
      return { success: false, message };
    }
  });

  /**
   * 登出
   */
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (event) => {
    logger.log('info', 'IPC请求：用户登出', { category: 'auth', source: 'IPC:Auth' });

    try {
      const networkInfo = getNetworkInfo();
      if (!networkInfo.ipv4) {
        logger.log('error', 'IPC错误：登出失败，无法获取IP地址', { category: 'auth', source: 'IPC:Auth' });
        return { success: false, message: '无法获取本机 IP 地址' };
      }

      logger.log('info', 'IPC处理：开始登出', {
        category: 'auth',
        source: 'IPC:Auth',
        data: { IP: networkInfo.ipv4 },
      });

      const result = await authService.logout(networkInfo.ipv4);

      if (result.success) {
        logger.log('success', 'IPC响应：登出成功', { category: 'auth', source: 'IPC:Auth' });
        const win = BrowserWindow.fromWebContents(event.sender);
        win?.webContents.send(IPC_EVENTS.AUTH_STATUS_CHANGED, 'idle');
      } else {
        logger.log('warn', `IPC响应：登出失败 - ${result.message}`, { category: 'auth', source: 'IPC:Auth' });
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      logger.log('error', `IPC异常：登出过程异常`, {
        category: 'auth',
        source: 'IPC:Auth',
        data: { 错误: message },
      });
      return { success: false, message };
    }
  });

  logger.log('info', '认证IPC处理器已注册', { category: 'system', source: 'IPC:Auth' });
}
