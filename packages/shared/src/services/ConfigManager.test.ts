import { describe, expect, it, vi } from 'vitest';
import { ConfigManager } from './ConfigManager';
import { MemoryStorageAdapter } from './StorageAdapter';

describe('ConfigManager', () => {
  it.each([{ raw: 42 }, { raw: [] }])(
    '非对象配置 $raw 保留原值，不迁移为默认值',
    async ({ raw }) => {
      const storage = new MemoryStorageAdapter();
      await storage.set('app_config', raw);
      const save = vi.spyOn(storage, 'set');
      await expect(new ConfigManager(storage).load()).rejects.toThrow('原数据已保留');
      expect(save).not.toHaveBeenCalled();
      expect(await storage.get('app_config')).toEqual(raw);
    }
  );
  it('已有配置不合法时保留原数据并报告错误', async () => {
    const storage = new MemoryStorageAdapter();
    const raw = { accounts: [{ id: 'one', username: 'u', password: '' }] };
    await storage.set('app_config', raw);
    const save = vi.spyOn(storage, 'set');
    await expect(new ConfigManager(storage).load()).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
    expect(await storage.get('app_config')).toEqual(raw);
  });

  it('临时读取失败后可重新加载，不写入默认配置', async () => {
    const storage = new MemoryStorageAdapter();
    const original = await new ConfigManager(storage).load();
    const save = vi.spyOn(storage, 'set');
    vi.spyOn(storage, 'get').mockRejectedValueOnce(new Error('temporarily unavailable'));
    const manager = new ConfigManager(storage);
    await expect(manager.load()).rejects.toThrow('temporarily unavailable');
    expect(save).not.toHaveBeenCalled();
    expect(await manager.load()).toEqual(original);
  });
  it('应在加载旧配置时自动迁移到新模型', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.set('app_config', {
      accounts: [
        {
          id: 'acc-1',
          name: '校园网账号',
          username: '20260001',
          password: 'secret',
          serverUrl: 'http://10.10.102.50:801',
          isp: 'campus',
        },
      ],
      currentAccountId: 'acc-1',
      wifiList: [
        {
          id: 'wifi-1',
          ssid: 'TUST',
          password: 'wifi-pass',
          autoConnect: true,
          requiresAuth: true,
          linkedAccountId: 'acc-1',
          priority: 3,
        },
      ],
      settings: {
        autoLaunch: true,
        enableHeartbeat: false,
        pollingInterval: 45,
        autoReconnect: true,
        maxRetries: 4,
        showNotification: false,
        autoUpdate: false,
      },
    });

    const manager = new ConfigManager(storage);
    const config = await manager.load();

    expect(config.settings.heartbeatIntervalSeconds).toBe(45);
    expect(config.settings.wifiReconnectRetries).toBe(4);
    expect(config.settings.notificationSettings).toEqual({
      wifiDisconnected: false,
      reconnectSuccess: false,
      reconnectFailed: false,
      authRecovered: false,
    });
    expect(config.wifiList[0].linkedAccountIds).toEqual(['acc-1']);
    expect(config.wifiList[0].lastConnectedAt).toBeNull();

    const saved = await storage.get<{
      settings: { heartbeatIntervalSeconds: number };
      wifiList: Array<{ linkedAccountIds: string[] }>;
    }>('app_config');
    expect(saved.settings.heartbeatIntervalSeconds).toBe(45);
    expect(saved.wifiList[0].linkedAccountIds).toEqual(['acc-1']);
  });

  it('更新设置时应保留默认结构并同步兼容字段', async () => {
    const manager = new ConfigManager(new MemoryStorageAdapter());
    await manager.load();

    const settings = await manager.updateSettings({
      heartbeatIntervalSeconds: 60,
      wifiReconnectRetries: 5,
      notificationSettings: {
        wifiDisconnected: true,
        reconnectSuccess: false,
        reconnectFailed: true,
        authRecovered: false,
      },
    });

    expect(settings.heartbeatIntervalSeconds).toBe(60);
    expect(settings.pollingInterval).toBe(60);
    expect(settings.wifiReconnectRetries).toBe(5);
    expect(settings.maxRetries).toBe(5);
    expect(settings.showNotification).toBe(true);
  });

  it('保存后重新加载时分项通知开关不被兼容字段 showNotification 覆盖', async () => {
    const storage = new MemoryStorageAdapter();
    const manager = new ConfigManager(storage);
    await manager.load();
    await manager.updateSettings({
      notificationSettings: {
        wifiDisconnected: true,
        reconnectSuccess: false,
        reconnectFailed: true,
        authRecovered: false,
      },
    });

    const reloaded = await new ConfigManager(storage).load();
    expect(reloaded.settings.notificationSettings).toEqual({
      wifiDisconnected: true,
      reconnectSuccess: false,
      reconnectFailed: true,
      authRecovered: false,
    });
  });
});
