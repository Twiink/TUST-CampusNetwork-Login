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
});
