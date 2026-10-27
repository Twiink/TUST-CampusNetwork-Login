import { useState } from 'react';
import { act, renderHook } from '@testing-library/react-native';
import type { AccountConfig } from '@repo/shared';
import { AccountManager, ConfigManager, MemoryStorageAdapter } from '@repo/shared';
import { useAccountActions } from '../src/context/useAccountActions';
import type { MobileServices } from '../src/context/mobileServices';

const firstInput = {
  name: '账号一',
  username: '20250001',
  password: 'secret-1',
  serverUrl: 'http://10.10.102.50:801',
  isp: 'campus' as const,
};

const secondInput = {
  name: '账号二',
  username: '20250002',
  password: 'secret-2',
  serverUrl: 'http://10.10.102.50:801',
  isp: 'cmcc' as const,
};

function createHarness() {
  const configManager = new ConfigManager(new MemoryStorageAdapter());
  const accountManager = new AccountManager(configManager);
  const servicesRef = {
    current: { accountManager } as unknown as MobileServices,
  };
  const addLog = jest.fn();
  const syncConfigState = jest.fn();

  const hook = renderHook(() => {
    const [accounts, setAccounts] = useState<AccountConfig[]>([]);
    const [currentAccount, setCurrentAccount] = useState<AccountConfig | null>(null);
    const actions = useAccountActions({
      servicesRef,
      accounts,
      currentAccount,
      setAccounts,
      setCurrentAccount,
      addLog,
      syncConfigState,
    });
    return { ...actions, accounts, currentAccount };
  });

  return { ...hook, accountManager, configManager, addLog, syncConfigState };
}

describe('useAccountActions', () => {
  it('添加首个账号后同步列表、当前账号和配置状态', async () => {
    const harness = createHarness();
    await harness.configManager.load();

    await act(async () => {
      await harness.result.current.addAccount(firstInput);
    });

    expect(harness.result.current.accounts).toHaveLength(1);
    expect(harness.result.current.accounts[0].username).toBe('20250001');
    expect(harness.result.current.currentAccount?.username).toBe('20250001');
    expect(harness.configManager.getConfig()?.currentAccountId).toBe(
      harness.result.current.accounts[0].id
    );
    expect(harness.syncConfigState).toHaveBeenCalled();
    expect(harness.addLog).toHaveBeenCalledWith('success', '添加账户: 20250001');
  });

  it('支持添加、切换、更新和删除当前账号', async () => {
    const harness = createHarness();
    await harness.configManager.load();

    await act(async () => {
      await harness.result.current.addAccount(firstInput);
      await harness.result.current.addAccount(secondInput);
    });

    expect(harness.result.current.accounts).toHaveLength(2);
    const second = harness.result.current.accounts[1];

    await act(async () => {
      await harness.result.current.switchAccount(second.id);
    });
    expect(harness.result.current.currentAccount?.id).toBe(second.id);
    expect(harness.configManager.getConfig()?.currentAccountId).toBe(second.id);

    await act(async () => {
      await harness.result.current.updateAccount(second.id, { password: 'new-secret' });
    });
    expect(harness.result.current.currentAccount?.password).toBe('new-secret');

    await act(async () => {
      await harness.result.current.removeAccount(second.id);
    });
    expect(harness.result.current.accounts).toHaveLength(1);
    expect(harness.result.current.currentAccount?.username).toBe('20250001');
    expect(harness.configManager.getConfig()?.currentAccountId).toBe(
      harness.result.current.accounts[0].id
    );
  });

  it('服务未初始化时抛出明确错误', async () => {
    const hook = renderHook(() => {
      const [accounts, setAccounts] = useState<AccountConfig[]>([]);
      const [currentAccount, setCurrentAccount] = useState<AccountConfig | null>(null);
      const actions = useAccountActions({
        servicesRef: { current: null },
        accounts,
        currentAccount,
        setAccounts,
        setCurrentAccount,
        addLog: jest.fn(),
      });
      return actions;
    });

    await act(async () => {
      await expect(hook.result.current.addAccount(firstInput)).rejects.toThrow('服务未初始化');
    });
  });
});
