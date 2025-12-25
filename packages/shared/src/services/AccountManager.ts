/**
 * 账户管理服务
 */

import { AccountConfig } from '../types/config';
import { validateAccountConfig, createDefaultAccountConfig, generateId } from '../utils/validator';
import { ErrorCode, AppError } from '../constants/errors';
import { ConfigManager } from './ConfigManager';

/**
 * 账户管理服务类
 */
export class AccountManager {
  constructor(private configManager: ConfigManager) {}

  /**
   * 获取所有账户
   */
  getAccounts(): AccountConfig[] {
    const config = this.configManager.getConfig();
    return config?.accounts || [];
  }

  /**
   * 获取当前账户
   */
  getCurrentAccount(): AccountConfig | null {
    const config = this.configManager.getConfig();
    if (!config || !config.currentAccountId) {
      return null;
    }
    return config.accounts.find(a => a.id === config.currentAccountId) || null;
  }

  /**
   * 获取当前账户 ID
   */
  getCurrentAccountId(): string | null {
    const config = this.configManager.getConfig();
    return config?.currentAccountId || null;
  }

  /**
   * 根据 ID 获取账户
   */
  getAccountById(id: string): AccountConfig | null {
    const accounts = this.getAccounts();
    return accounts.find(a => a.id === id) || null;
  }

  /**
   * 添加账户
   */
  async addAccount(account: Omit<AccountConfig, 'id'> & { id?: string }): Promise<AccountConfig> {
    const newAccount: AccountConfig = {
      ...createDefaultAccountConfig(),
      ...account,
      id: account.id || generateId(),
    };

    const validation = validateAccountConfig(newAccount);
    if (!validation.valid) {
      throw new AppError(ErrorCode.INVALID_PARAMS, validation.errors.join('; '));
    }

    const config = this.configManager.getConfig();
    if (!config) {
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '配置未加载');
    }

    // 检查是否已存在相同用户名的账户
    const exists = config.accounts.find(a => a.username === newAccount.username);
    if (exists) {
      throw new AppError(ErrorCode.INVALID_PARAMS, '该用户名已存在');
    }

    const updatedAccounts = [...config.accounts, newAccount];

    // 如果是第一个账户，自动设为当前账户
    const currentAccountId = config.currentAccountId || newAccount.id;

    await this.configManager.update({
      accounts: updatedAccounts,
      currentAccountId,
    });

    return newAccount;
  }

  /**
   * 更新账户
   */
  async updateAccount(id: string, updates: Partial<Omit<AccountConfig, 'id'>>): Promise<AccountConfig> {
    const config = this.configManager.getConfig();
    if (!config) {
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '配置未加载');
    }

    const index = config.accounts.findIndex(a => a.id === id);
    if (index === -1) {
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '账户不存在');
    }

    const updatedAccount: AccountConfig = {
      ...config.accounts[index],
      ...updates,
      id, // 确保 ID 不变
    };

    const validation = validateAccountConfig(updatedAccount);
    if (!validation.valid) {
      throw new AppError(ErrorCode.INVALID_PARAMS, validation.errors.join('; '));
    }

    const updatedAccounts = [...config.accounts];
    updatedAccounts[index] = updatedAccount;

    await this.configManager.update({ accounts: updatedAccounts });

    return updatedAccount;
  }

  /**
   * 删除账户
   */
  async removeAccount(id: string): Promise<void> {
    const config = this.configManager.getConfig();
    if (!config) {
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '配置未加载');
    }

    const updatedAccounts = config.accounts.filter(a => a.id !== id);

    if (updatedAccounts.length === config.accounts.length) {
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '账户不存在');
    }

    // 如果删除的是当前账户，切换到第一个账户
    let currentAccountId = config.currentAccountId;
    if (currentAccountId === id) {
      currentAccountId = updatedAccounts.length > 0 ? updatedAccounts[0].id : null;
    }

    await this.configManager.update({
      accounts: updatedAccounts,
      currentAccountId,
    });
  }

  /**
   * 切换当前账户
   */
  async switchAccount(id: string): Promise<AccountConfig> {
    const config = this.configManager.getConfig();
    if (!config) {
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '配置未加载');
    }

    const account = config.accounts.find(a => a.id === id);
    if (!account) {
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '账户不存在');
    }

    await this.configManager.update({ currentAccountId: id });

    return account;
  }

  /**
   * 获取账户数量
   */
  getAccountCount(): number {
    return this.getAccounts().length;
  }

  /**
   * 检查是否有账户
   */
  hasAccounts(): boolean {
    return this.getAccountCount() > 0;
  }
}

/**
 * 创建账户管理服务实例
 */
export function createAccountManager(configManager: ConfigManager): AccountManager {
  return new AccountManager(configManager);
}
