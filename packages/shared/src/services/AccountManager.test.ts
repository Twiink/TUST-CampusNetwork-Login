import { describe, expect, it } from 'vitest';
import { ConfigManager } from './ConfigManager';
import { MemoryStorageAdapter } from './StorageAdapter';
import { AccountManager } from './AccountManager';

describe('AccountManager', () => {
  it('添加首个账号时应自动设为当前账号', async () => {
    const configManager = new ConfigManager(new MemoryStorageAdapter());
    await configManager.load();
    const manager = new AccountManager(configManager);

    const account = await manager.addAccount({
      name: '校园网',
      username: '20260001',
      password: 'secret',
      serverUrl: 'http://10.10.102.50:801',
      isp: 'campus',
    });

    expect(account.id).toBeTruthy();
    expect(manager.getCurrentAccountId()).toBe(account.id);
  });

  it('添加账号时清理首尾空白并拒绝重复用户名', async () => {
    const configManager = new ConfigManager(new MemoryStorageAdapter());
    await configManager.load();
    const manager = new AccountManager(configManager);

    const account = await manager.addAccount({
      name: '  校园网账号  ',
      username: '  20260001  ',
      password: 'secret',
      serverUrl: '  http://10.10.102.50:801  ',
      isp: 'campus',
    });

    expect(account).toMatchObject({
      name: '校园网账号',
      username: '20260001',
      serverUrl: 'http://10.10.102.50:801',
    });
    await expect(
      manager.addAccount({
        name: '重复账号',
        username: ' 20260001 ',
        password: 'secret',
        serverUrl: 'http://10.10.102.50:801',
        isp: 'cmcc',
      })
    ).rejects.toThrow('该用户名已存在');
  });

  it('更新账号时拒绝与其他账号重名', async () => {
    const configManager = new ConfigManager(new MemoryStorageAdapter());
    await configManager.load();
    const manager = new AccountManager(configManager);
    const first = await manager.addAccount({
      name: '账号一',
      username: '20260001',
      password: 'secret',
      serverUrl: 'http://10.10.102.50:801',
      isp: 'campus',
    });
    const second = await manager.addAccount({
      name: '账号二',
      username: '20260002',
      password: 'secret',
      serverUrl: 'http://10.10.102.50:801',
      isp: 'cmcc',
    });

    await expect(
      manager.updateAccount(second.id, { username: ` ${first.username} ` })
    ).rejects.toThrow('该用户名已存在');
    expect(manager.getAccountById(second.id)?.username).toBe('20260002');
  });

  it('删除当前账号时应自动切换到剩余首个账号', async () => {
    const configManager = new ConfigManager(new MemoryStorageAdapter());
    await configManager.load();
    const manager = new AccountManager(configManager);

    const first = await manager.addAccount({
      name: '账号一',
      username: '20260001',
      password: 'secret',
      serverUrl: 'http://10.10.102.50:801',
      isp: 'campus',
    });
    const second = await manager.addAccount({
      name: '账号二',
      username: '20260002',
      password: 'secret',
      serverUrl: 'http://10.10.102.50:801',
      isp: 'cmcc',
    });

    await manager.switchAccount(second.id);
    await manager.removeAccount(second.id);

    expect(manager.getCurrentAccountId()).toBe(first.id);
  });

  it('删除被 WiFi 关联的账号时应清理全部关联引用并成功保存', async () => {
    const storage = new MemoryStorageAdapter();
    const configManager = new ConfigManager(storage);
    await configManager.load();
    const manager = new AccountManager(configManager);

    const primary = await manager.addAccount({
      name: '主账号',
      username: '20260001',
      password: 'secret',
      serverUrl: 'http://10.10.102.50:801',
      isp: 'campus',
    });
    const fallback = await manager.addAccount({
      name: '备用账号',
      username: '20260002',
      password: 'secret',
      serverUrl: 'http://10.10.102.50:801',
      isp: 'cmcc',
    });
    await configManager.update({
      wifiList: [
        {
          id: 'wifi-1',
          ssid: 'TUST-WIFI',
          password: '',
          autoConnect: true,
          requiresAuth: true,
          linkedAccountIds: [primary.id, fallback.id],
          linkedAccountId: primary.id,
          priority: 1,
          lastConnectedAt: null,
        },
      ],
    });

    await manager.removeAccount(primary.id);

    const wifi = configManager.getConfig()?.wifiList[0];
    expect(wifi?.linkedAccountIds).toEqual([fallback.id]);
    expect(wifi?.linkedAccountId).toBe(fallback.id);

    const reloaded = await new ConfigManager(storage).load();
    expect(reloaded.accounts.map((account) => account.id)).toEqual([fallback.id]);
    expect(reloaded.wifiList[0].linkedAccountIds).toEqual([fallback.id]);
  });

  it('删除最后一个关联账号后允许保存未关联的认证 WiFi', async () => {
    const storage = new MemoryStorageAdapter();
    const configManager = new ConfigManager(storage);
    await configManager.load();
    const manager = new AccountManager(configManager);
    const account = await manager.addAccount({
      name: '唯一账号',
      username: '20260001',
      password: 'secret',
      serverUrl: 'http://10.10.102.50:801',
      isp: 'campus',
    });
    await configManager.update({
      wifiList: [
        {
          id: 'wifi-1',
          ssid: 'TUST-WIFI',
          password: '',
          autoConnect: true,
          requiresAuth: true,
          linkedAccountIds: [account.id],
          linkedAccountId: account.id,
          priority: 1,
          lastConnectedAt: null,
        },
      ],
    });

    await manager.removeAccount(account.id);

    expect(configManager.getConfig()?.accounts).toEqual([]);
    expect(configManager.getConfig()?.wifiList[0].linkedAccountIds).toEqual([]);

    const reloaded = await new ConfigManager(storage).load();
    expect(reloaded.accounts).toEqual([]);
    expect(reloaded.wifiList[0].requiresAuth).toBe(true);
  });

  it('切换、更新或删除不存在的账号时返回明确错误', async () => {
    const configManager = new ConfigManager(new MemoryStorageAdapter());
    await configManager.load();
    const manager = new AccountManager(configManager);

    await expect(manager.switchAccount('missing')).rejects.toThrow('账户不存在');
    await expect(manager.updateAccount('missing', { name: '不存在' })).rejects.toThrow(
      '账户不存在'
    );
    await expect(manager.removeAccount('missing')).rejects.toThrow('账户不存在');
  });

  it('配置未加载时拒绝写操作', async () => {
    const manager = new AccountManager(new ConfigManager(new MemoryStorageAdapter()));

    await expect(
      manager.addAccount({
        name: '账号一',
        username: '20260001',
        password: 'secret',
        serverUrl: 'http://10.10.102.50:801',
        isp: 'campus',
      })
    ).rejects.toThrow('配置未加载');
    expect(manager.hasAccounts()).toBe(false);
  });
});
