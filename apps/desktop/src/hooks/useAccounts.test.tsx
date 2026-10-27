import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountConfig } from '@repo/shared';
import { useAccounts } from './useAccounts';

const first: AccountConfig = {
  id: 'a1',
  name: '账号一',
  username: '20250001',
  password: 'secret',
  serverUrl: 'http://10.10.102.50:801',
  isp: 'campus',
};

const second: AccountConfig = {
  ...first,
  id: 'a2',
  name: '账号二',
  username: '20250002',
  isp: 'cmcc',
};

describe('useAccounts', () => {
  beforeEach(() => {
    vi.mocked(window.electronAPI.account.list).mockResolvedValue([first]);
    vi.mocked(window.electronAPI.account.getCurrent).mockResolvedValue(first);
    vi.mocked(window.electronAPI.account.add).mockResolvedValue(second);
    vi.mocked(window.electronAPI.account.update).mockResolvedValue({
      ...first,
      password: 'new-secret',
    });
    vi.mocked(window.electronAPI.account.remove).mockResolvedValue(undefined);
    vi.mocked(window.electronAPI.account.switch).mockResolvedValue(second);
  });

  it('加载账户与当前账户', async () => {
    const { result } = renderHook(() => useAccounts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accounts).toEqual([first]);
    expect(result.current.currentAccount).toEqual(first);
    expect(result.current.error).toBeNull();
  });

  it('添加首个账户时自动将其设为当前账户', async () => {
    vi.mocked(window.electronAPI.account.list).mockResolvedValue([]);
    vi.mocked(window.electronAPI.account.getCurrent).mockResolvedValue(null);
    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(
        result.current.addAccount({
          name: second.name,
          username: second.username,
          password: second.password,
          serverUrl: second.serverUrl,
          isp: second.isp,
        })
      ).resolves.toEqual(second);
    });

    expect(result.current.accounts).toEqual([second]);
    expect(result.current.currentAccount).toEqual(second);
  });

  it('更新当前账户后同步列表与当前项', async () => {
    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.accounts).toEqual([first]));

    await act(async () => {
      await result.current.updateAccount(first.id, { password: 'new-secret' });
    });

    expect(result.current.accounts[0].password).toBe('new-secret');
    expect(result.current.currentAccount?.password).toBe('new-secret');
  });

  it('删除当前账户后切换到剩余首个账户', async () => {
    vi.mocked(window.electronAPI.account.list).mockResolvedValue([first, second]);
    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.accounts).toEqual([first, second]));

    await act(async () => {
      await result.current.removeAccount(first.id);
    });

    expect(result.current.accounts).toEqual([second]);
    expect(result.current.currentAccount).toEqual(second);
  });

  it('切换账户并透传错误信息', async () => {
    const { result } = renderHook(() => useAccounts());
    await waitFor(() => expect(result.current.accounts).toEqual([first]));

    await act(async () => {
      await expect(result.current.switchAccount(second.id)).resolves.toEqual(second);
    });
    expect(result.current.currentAccount).toEqual(second);

    vi.mocked(window.electronAPI.account.add).mockRejectedValue(new Error('账户已存在'));
    await act(async () => {
      await expect(
        result.current.addAccount({
          name: '重复',
          username: first.username,
          password: 'secret',
          serverUrl: first.serverUrl,
          isp: 'campus',
        })
      ).rejects.toThrow('账户已存在');
    });
    expect(result.current.error).toBe('账户已存在');
  });
});
