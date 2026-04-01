import { describe, expect, it } from 'vitest';
import { ConfigManager } from './ConfigManager';
import { MemoryStorageAdapter } from './StorageAdapter';
import { WifiManager } from './WifiManager';

describe('WifiManager', () => {
  it('应支持同 SSID 不同安全类型或 BSSID 的精确匹配', async () => {
    const configManager = new ConfigManager(new MemoryStorageAdapter());
    await configManager.load();
    await configManager.update({
      accounts: [
        {
          id: 'acc-1',
          name: '账号一',
          username: '20260001',
          password: 'secret',
          serverUrl: 'http://10.10.102.50:801',
          isp: 'campus',
        },
        {
          id: 'acc-2',
          name: '账号二',
          username: '20260002',
          password: 'secret',
          serverUrl: 'http://10.10.102.50:801',
          isp: 'campus',
        },
      ],
    });
    const manager = new WifiManager(configManager);

    await manager.addWifi({
      ssid: 'TUST',
      password: 'wifi-pass',
      autoConnect: true,
      requiresAuth: true,
      linkedAccountIds: ['acc-1'],
      security: 'WPA2',
      bssid: '00:11:22:33:44:55',
      priority: 5,
      lastConnectedAt: null,
    });
    await manager.addWifi({
      ssid: 'TUST',
      password: 'wifi-pass',
      autoConnect: true,
      requiresAuth: true,
      linkedAccountIds: ['acc-2'],
      security: 'WPA3',
      bssid: '00:11:22:33:44:66',
      priority: 4,
      lastConnectedAt: null,
    });

    const matched = manager.findMatchingWifi({
      ssid: 'TUST',
      security: 'WPA3',
      bssid: '00:11:22:33:44:66',
    });

    expect(matched?.linkedAccountIds).toEqual(['acc-2']);
  });

  it('同优先级时应按最近成功连接时间倒序排序', async () => {
    const configManager = new ConfigManager(new MemoryStorageAdapter());
    await configManager.load();
    const manager = new WifiManager(configManager);

    const first = await manager.addWifi({
      ssid: 'Dorm',
      password: 'wifi-pass',
      autoConnect: true,
      requiresAuth: false,
      linkedAccountIds: [],
      priority: 10,
      lastConnectedAt: 100,
    });
    await manager.addWifi({
      ssid: 'Library',
      password: 'wifi-pass',
      autoConnect: true,
      requiresAuth: false,
      linkedAccountIds: [],
      priority: 10,
      lastConnectedAt: 200,
    });

    await manager.markConnected(first.id, 300);

    expect(manager.getAutoConnectWifiList().map((wifi) => wifi.ssid)).toEqual(['Dorm', 'Library']);
  });
});
