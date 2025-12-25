/**
 * 账户管理 Hook
 */

import { useState, useCallback, useEffect } from 'react';
import type { AccountConfig } from '@repo/shared';

export function useAccounts() {
  const [accounts, setAccounts] = useState<AccountConfig[]>([]);
  const [currentAccount, setCurrentAccount] = useState<AccountConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const [list, current] = await Promise.all([
        window.electronAPI.account.list(),
        window.electronAPI.account.getCurrent(),
      ]);
      setAccounts(list);
      setCurrentAccount(current);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取账户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const addAccount = useCallback(async (account: Omit<AccountConfig, 'id'>) => {
    setLoading(true);
    try {
      const newAccount = await window.electronAPI.account.add(account);
      setAccounts(prev => [...prev, newAccount]);
      // 如果是第一个账户，自动设为当前账户
      if (!currentAccount) {
        setCurrentAccount(newAccount);
      }
      setError(null);
      return newAccount;
    } catch (err) {
      const message = err instanceof Error ? err.message : '添加账户失败';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [currentAccount]);

  const updateAccount = useCallback(async (id: string, updates: Partial<AccountConfig>) => {
    setLoading(true);
    try {
      const updated = await window.electronAPI.account.update(id, updates);
      setAccounts(prev => prev.map(a => a.id === id ? updated : a));
      if (currentAccount?.id === id) {
        setCurrentAccount(updated);
      }
      setError(null);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : '更新账户失败';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [currentAccount]);

  const removeAccount = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await window.electronAPI.account.remove(id);
      setAccounts(prev => prev.filter(a => a.id !== id));
      if (currentAccount?.id === id) {
        // 切换到第一个账户
        const remaining = accounts.filter(a => a.id !== id);
        setCurrentAccount(remaining.length > 0 ? remaining[0] : null);
      }
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '删除账户失败';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [currentAccount, accounts]);

  const switchAccount = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const account = await window.electronAPI.account.switch(id);
      setCurrentAccount(account);
      setError(null);
      return account;
    } catch (err) {
      const message = err instanceof Error ? err.message : '切换账户失败';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return {
    accounts,
    currentAccount,
    loading,
    error,
    fetchAccounts,
    addAccount,
    updateAccount,
    removeAccount,
    switchAccount,
  };
}
