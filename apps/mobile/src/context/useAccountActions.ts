/**
 * 账户管理操作(自 AppContext 抽出):增删改查与切换,联动 AccountManager 与本地状态。
 */

import { useCallback } from 'react';
import type { AccountConfig } from '@repo/shared';
import type { MobileServices } from './mobileServices';

interface UseAccountActionsOptions {
  servicesRef: React.MutableRefObject<MobileServices | null>;
  accounts: AccountConfig[];
  currentAccount: AccountConfig | null;
  setAccounts: React.Dispatch<React.SetStateAction<AccountConfig[]>>;
  setCurrentAccount: React.Dispatch<React.SetStateAction<AccountConfig | null>>;
  addLog: (level: 'info' | 'success' | 'warn' | 'error', message: string) => void;
  /** 账户管理器已经把变更持久化到 ConfigManager，这里只同步 React 状态。 */
  syncConfigState?: () => void;
}

export function useAccountActions({
  servicesRef,
  accounts,
  currentAccount,
  setAccounts,
  setCurrentAccount,
  addLog,
  syncConfigState,
}: UseAccountActionsOptions) {
  const addAccount = useCallback(
    async (account: Omit<AccountConfig, 'id'>): Promise<AccountConfig> => {
      if (!servicesRef.current) {
        throw new Error('服务未初始化');
      }

      const newAccount = await servicesRef.current.accountManager.addAccount(account);
      setAccounts(prev => [...prev, newAccount]);

      // 如果是第一个账户，自动设为当前账户
      if (accounts.length === 0) {
        await servicesRef.current.accountManager.switchAccount(newAccount.id);
        setCurrentAccount(newAccount);
      }

      syncConfigState?.();
      addLog('success', `添加账户: ${newAccount.username}`);
      return newAccount;
    },
    [accounts.length, addLog, servicesRef, setAccounts, setCurrentAccount, syncConfigState]
  );

  const updateAccount = useCallback(
    async (id: string, updates: Partial<AccountConfig>): Promise<AccountConfig> => {
      if (!servicesRef.current) {
        throw new Error('服务未初始化');
      }

      const updated = await servicesRef.current.accountManager.updateAccount(id, updates);
      setAccounts(prev => prev.map(a => (a.id === id ? updated : a)));

      if (currentAccount?.id === id) {
        setCurrentAccount(updated);
      }

      syncConfigState?.();
      addLog('info', `更新账户: ${updated.username}`);
      return updated;
    },
    [addLog, currentAccount?.id, servicesRef, setAccounts, setCurrentAccount, syncConfigState]
  );

  const removeAccount = useCallback(
    async (id: string): Promise<void> => {
      if (!servicesRef.current) {
        throw new Error('服务未初始化');
      }

      const account = servicesRef.current.accountManager.getAccountById(id);
      await servicesRef.current.accountManager.removeAccount(id);
      setAccounts(prev => prev.filter(a => a.id !== id));
      setCurrentAccount(servicesRef.current.accountManager.getCurrentAccount());

      syncConfigState?.();
      addLog('warn', `删除账户: ${account?.username || id}`);
    },
    [addLog, servicesRef, setAccounts, setCurrentAccount, syncConfigState]
  );

  const switchAccount = useCallback(
    async (id: string): Promise<void> => {
      if (!servicesRef.current) {
        throw new Error('服务未初始化');
      }

      await servicesRef.current.accountManager.switchAccount(id);
      const account = servicesRef.current.accountManager.getAccountById(id);
      setCurrentAccount(account);

      syncConfigState?.();
      addLog('info', `切换到账户: ${account?.username || id}`);
    },
    [addLog, servicesRef, setCurrentAccount, syncConfigState]
  );

  return { addAccount, updateAccount, removeAccount, switchAccount };
}
