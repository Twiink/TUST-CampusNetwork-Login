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

  describe('resolveAuthRequirement（三级判定：配置优先 → 校园网启发式 → 无需认证）', () => {
    it('已配置 WiFi 应采用用户显式配置', async () => {
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
        ],
      });
      const manager = new WifiManager(configManager);

      await manager.addWifi({
        ssid: 'TUST-Dorm',
        password: 'wifi-pass',
        autoConnect: true,
        requiresAuth: true,
        linkedAccountIds: ['acc-1'],
        priority: 1,
        lastConnectedAt: null,
      });

      expect(manager.resolveAuthRequirement('TUST-Dorm', '10.1.2.3')).toEqual({
        requiresAuth: true,
        isConfigured: true,
        hasLinkedAccount: true,
      });
    });

    it('已配置为无需认证的 WiFi 即便是校园网 SSID 也应跳过认证', async () => {
      const configManager = new ConfigManager(new MemoryStorageAdapter());
      await configManager.load();
      const manager = new WifiManager(configManager);

      await manager.addWifi({
        ssid: 'TUST-Lab',
        password: 'wifi-pass',
        autoConnect: true,
        requiresAuth: false,
        linkedAccountIds: [],
        priority: 1,
        lastConnectedAt: null,
      });

      expect(manager.resolveAuthRequirement('TUST-Lab', '10.1.2.3')).toEqual({
        requiresAuth: false,
        isConfigured: true,
        hasLinkedAccount: false,
      });
    });

    it('未配置但符合校园网启发式（TUST 前缀 + 10.x）应视为需认证', () => {
      const configManager = new ConfigManager(new MemoryStorageAdapter());
      const manager = new WifiManager(configManager);

      expect(manager.resolveAuthRequirement('CU_TUST_5G', '10.10.1.1')).toEqual({
        requiresAuth: true,
        isConfigured: false,
        hasLinkedAccount: false,
      });
    });

    it('未配置且非校园网（家庭 WiFi/热点）应视为无需认证', () => {
      const configManager = new ConfigManager(new MemoryStorageAdapter());
      const manager = new WifiManager(configManager);

      expect(manager.resolveAuthRequirement('Home-WiFi', '192.168.1.5')).toEqual({
        requiresAuth: false,
        isConfigured: false,
        hasLinkedAccount: false,
      });
      // SSID 像校园网但 IP 不在 10.x（如手机热点）也不触发
      expect(manager.resolveAuthRequirement('TUST-Student', '192.168.43.1')).toEqual({
        requiresAuth: false,
        isConfigured: false,
        hasLinkedAccount: false,
      });
    });

    it('SSID 缺失时应返回无需认证', () => {
      const configManager = new ConfigManager(new MemoryStorageAdapter());
      const manager = new WifiManager(configManager);

      expect(manager.resolveAuthRequirement(null, '10.1.2.3')).toEqual({
        requiresAuth: false,
        isConfigured: false,
        hasLinkedAccount: false,
      });
      expect(manager.resolveAuthRequirement(undefined)).toEqual({
        requiresAuth: false,
        isConfigured: false,
        hasLinkedAccount: false,
      });
    });
  });
});
