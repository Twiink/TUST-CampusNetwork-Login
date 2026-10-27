import { AccountConfig } from '../types/config';
import {
  validateAccountConfig,
  createDefaultAccountConfig,
  generateId,
  normalizeWifiConfig,
} from '../utils/validator';
import { ErrorCode, AppError } from '../constants/errors';
import { ConfigManager } from './ConfigManager';
import type { Logger } from '../models/Logger';

export class AccountManager {
  constructor(
    private configManager: ConfigManager,
    private logger?: Logger
  ) {}
  getAccounts(): AccountConfig[] {
    return this.configManager.getConfig()?.accounts ?? [];
  }
  getCurrentAccountId(): string | null {
    return this.configManager.getConfig()?.currentAccountId ?? null;
  }
  getAccountById(id: string): AccountConfig | null {
    return this.getAccounts().find((a) => a.id === id) ?? null;
  }
  getCurrentAccount(): AccountConfig | null {
    return this.getAccountById(this.getCurrentAccountId() ?? '');
  }
  getAccountCount(): number {
    return this.getAccounts().length;
  }
  hasAccounts(): boolean {
    return this.getAccountCount() > 0;
  }

  private assertLoaded(): void {
    if (!this.configManager.getConfig())
      throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '配置未加载');
  }

  private checked(account: AccountConfig): AccountConfig {
    const next = {
      ...account,
      username: account.username.trim(),
      name: account.name.trim() || account.username.trim(),
      serverUrl: account.serverUrl.trim(),
    };
    const result = validateAccountConfig(next);
    if (!result.valid) throw new AppError(ErrorCode.INVALID_PARAMS, result.errors.join('; '));
    return next;
  }

  async addAccount(account: Omit<AccountConfig, 'id'> & { id?: string }): Promise<AccountConfig> {
    this.assertLoaded();
    const next = this.checked({
      ...createDefaultAccountConfig(),
      ...account,
      id: account.id?.trim() || generateId(),
    });
    await this.configManager.update((current) => {
      if (current.accounts.some((a) => a.username === next.username || a.id === next.id))
        throw new AppError(ErrorCode.INVALID_PARAMS, '该用户名已存在');
      return {
        accounts: [...current.accounts, next],
        currentAccountId: current.currentAccountId || next.id,
      };
    });
    this.logger?.success('账户添加成功', { 账户ID: next.id });
    return next;
  }

  async updateAccount(
    id: string,
    updates: Partial<Omit<AccountConfig, 'id'>>
  ): Promise<AccountConfig> {
    this.assertLoaded();
    const result = await this.configManager.update((current) => {
      const previous = current.accounts.find((a) => a.id === id);
      if (!previous) throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '账户不存在');
      const next = this.checked({ ...previous, ...updates, id });
      if (current.accounts.some((a) => a.id !== id && a.username === next.username))
        throw new AppError(ErrorCode.INVALID_PARAMS, '该用户名已存在');
      return { accounts: current.accounts.map((a) => (a.id === id ? next : a)) };
    });
    this.logger?.info('账户更新成功', { 账户ID: id });
    return result.accounts.find((a) => a.id === id)!;
  }

  async removeAccount(id: string): Promise<void> {
    this.assertLoaded();
    await this.configManager.update((current) => {
      if (!current.accounts.some((a) => a.id === id))
        throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '账户不存在');
      const accounts = current.accounts.filter((a) => a.id !== id);
      return {
        accounts,
        currentAccountId:
          current.currentAccountId === id ? (accounts[0]?.id ?? null) : current.currentAccountId,
        wifiList: current.wifiList.map((w) =>
          normalizeWifiConfig({
            ...w,
            linkedAccountIds: w.linkedAccountIds.filter((a) => a !== id),
            linkedAccountId: undefined,
          })
        ),
      };
    });
    this.logger?.info('账户删除成功', { 账户ID: id });
  }

  async switchAccount(id: string): Promise<AccountConfig> {
    this.assertLoaded();
    const config = await this.configManager.update((current) => {
      if (!current.accounts.some((a) => a.id === id))
        throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '账户不存在');
      return { currentAccountId: id };
    });
    return config.accounts.find((a) => a.id === id)!;
  }
}
export function createAccountManager(
  configManager: ConfigManager,
  logger?: Logger
): AccountManager {
  return new AccountManager(configManager, logger);
}
