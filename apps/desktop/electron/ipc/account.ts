/**
 * 账户相关 IPC 处理
 */

import { ipcMain } from 'electron';
import { AccountManager, AccountConfig, createLogger } from '@repo/shared';
import { IPC_CHANNELS } from './channels';

/**
 * 注册账户 IPC 处理器
 */
export function registerAccountIPC(
  accountManager: AccountManager,
  logger: ReturnType<typeof createLogger>
) {
  /**
   * 获取账户列表
   */
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_LIST, async (): Promise<AccountConfig[]> => {
    return accountManager.getAccounts();
  });

  /**
   * 获取当前账户
   */
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_GET_CURRENT, async (): Promise<AccountConfig | null> => {
    return accountManager.getCurrentAccount();
  });

  /**
   * 添加账户
   */
  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_ADD,
    async (_, account: Omit<AccountConfig, 'id'>): Promise<AccountConfig> => {
      try {
        const newAccount = await accountManager.addAccount(account);
        logger.info(`账户已添加: ${newAccount.name}`);
        return newAccount;
      } catch (error) {
        logger.error('添加账户失败', error);
        throw error;
      }
    }
  );

  /**
   * 更新账户
   */
  ipcMain.handle(
    IPC_CHANNELS.ACCOUNT_UPDATE,
    async (_, id: string, updates: Partial<AccountConfig>): Promise<AccountConfig> => {
      try {
        const updated = await accountManager.updateAccount(id, updates);
        logger.info(`账户已更新: ${updated.name}`);
        return updated;
      } catch (error) {
        logger.error('更新账户失败', error);
        throw error;
      }
    }
  );

  /**
   * 删除账户
   */
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_REMOVE, async (_, id: string): Promise<void> => {
    try {
      await accountManager.removeAccount(id);
      logger.info('账户已删除');
    } catch (error) {
      logger.error('删除账户失败', error);
      throw error;
    }
  });

  /**
   * 切换账户
   */
  ipcMain.handle(IPC_CHANNELS.ACCOUNT_SWITCH, async (_, id: string): Promise<AccountConfig> => {
    try {
      const account = await accountManager.switchAccount(id);
      logger.info(`已切换至账户: ${account.name}`);
      return account;
    } catch (error) {
      logger.error('切换账户失败', error);
      throw error;
    }
  });
}
