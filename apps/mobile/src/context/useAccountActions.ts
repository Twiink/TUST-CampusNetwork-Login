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
  commitAction?: <T>(action: () => Promise<T>) => Promise<T>;
  /** 等待后台确认后再发布状态。 */
  syncConfigState?: () => void | Promise<void>;
}

export function useAccountActions({
  servicesRef,
  accounts,
  currentAccount,
  setAccounts,
  setCurrentAccount,
  addLog,
  syncConfigState,
  commitAction,
}: UseAccountActionsOptions) {
  const commit = useCallback(
    async <T>(action: () => Promise<T>): Promise<T> => {
      if (commitAction) return commitAction(action);
      const result = await action();
      await syncConfigState?.();
      return result;
    },
    [commitAction, syncConfigState]
  );
  const addAccount = useCallback(
    async (account: Omit<AccountConfig, 'id'>): Promise<AccountConfig> => {
      if (!servicesRef.current) {
        throw new Error('服务未初始化');
      }

      const newAccount = await commit(() =>
        servicesRef.current!.accountManager.addAccount(account)
      );
      if (!commitAction) setAccounts(prev => [...prev, newAccount]);

      // 如果是第一个账户，自动设为当前账户
      if (!commitAction && accounts.length === 0) {
        await commit(() => servicesRef.current!.accountManager.switchAccount(newAccount.id));
        setCurrentAccount(newAccount);
      }

      addLog('success', `添加账户: ${newAccount.username}`);
      return newAccount;
    },
    [accounts.length, addLog, servicesRef, setAccounts, setCurrentAccount, commit, commitAction]
  );

  const updateAccount = useCallback(
    async (id: string, updates: Partial<AccountConfig>): Promise<AccountConfig> => {
      if (!servicesRef.current) {
        throw new Error('服务未初始化');
      }

      const updated = await commit(() =>
        servicesRef.current!.accountManager.updateAccount(id, updates)
      );
      if (!commitAction) setAccounts(prev => prev.map(a => (a.id === id ? updated : a)));

      if (!commitAction && currentAccount?.id === id) {
        setCurrentAccount(updated);
      }

      addLog('info', `更新账户: ${updated.username}`);
      return updated;
    },
    [addLog, currentAccount?.id, servicesRef, setAccounts, setCurrentAccount, commit, commitAction]
  );

  const removeAccount = useCallback(
    async (id: string): Promise<void> => {
      if (!servicesRef.current) {
        throw new Error('服务未初始化');
      }

      const account = servicesRef.current.accountManager.getAccountById(id);
      await commit(() => servicesRef.current!.accountManager.removeAccount(id));
      if (!commitAction) {
        setAccounts(prev => prev.filter(a => a.id !== id));
        setCurrentAccount(servicesRef.current.accountManager.getCurrentAccount());
      }

      addLog('warn', `删除账户: ${account?.username || id}`);
    },
    [addLog, servicesRef, setAccounts, setCurrentAccount, commit, commitAction]
  );

  const switchAccount = useCallback(
    async (id: string): Promise<void> => {
      if (!servicesRef.current) {
        throw new Error('服务未初始化');
      }

      await commit(() => servicesRef.current!.accountManager.switchAccount(id));
      const account = servicesRef.current.accountManager.getAccountById(id);
      if (!commitAction) setCurrentAccount(account);

      addLog('info', `切换到账户: ${account?.username || id}`);
    },
    [addLog, servicesRef, setCurrentAccount, commit, commitAction]
  );

  return { addAccount, updateAccount, removeAccount, switchAccount };
}
