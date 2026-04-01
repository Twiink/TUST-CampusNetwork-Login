import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './AuthService';
import { AccountManager } from './AccountManager';
import { ConfigManager } from './ConfigManager';
import { MemoryStorageAdapter } from './StorageAdapter';
import { WifiManager } from './WifiManager';
import type { AccountConfig } from '../types/config';

function createFetchResponse(body: string) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => body,
    headers: {
      forEach: (callback: (value: string, key: string) => void) =>
        callback('text/plain', 'content-type'),
    },
  };
}

describe('认证集成流程', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('当匹配到已绑定 WiFi 时应按绑定顺序依次尝试多个账号', async () => {
    const configManager = new ConfigManager(new MemoryStorageAdapter());
    await configManager.load();

    const accountManager = new AccountManager(configManager);
    const wifiManager = new WifiManager(configManager);
    const authService = new AuthService();

    const primaryAccount = await accountManager.addAccount({
      name: '主账号',
      username: '20260001',
      password: 'wrong',
      serverUrl: 'http://10.10.102.50:801',
      isp: 'campus',
    });

    const fallbackAccount = await accountManager.addAccount({
      name: '备用账号',
      username: '20260002',
      password: 'correct',
      serverUrl: 'http://10.10.102.50:801',
      isp: 'campus',
    });

    await wifiManager.addWifi({
      ssid: 'TUST-WIFI',
      password: 'wifi-password',
      autoConnect: true,
      requiresAuth: true,
      security: 'WPA2-PSK',
      bssid: 'AA:BB:CC:DD:EE:FF',
      linkedAccountIds: [primaryAccount.id, fallbackAccount.id],
      priority: 1,
      lastConnectedAt: null,
    });

    const matchedWifi = wifiManager.matchWifi({
      ssid: 'TUST-WIFI',
      security: 'WPA2-PSK',
      bssid: 'AA:BB:CC:DD:EE:FF',
    });

    expect(matchedWifi?.linkedAccountIds).toEqual([primaryAccount.id, fallbackAccount.id]);

    const selectedAccounts = matchedWifi!.linkedAccountIds
      .map((accountId) => accountManager.getAccountById(accountId))
      .filter((account): account is AccountConfig => account !== null);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createFetchResponse('dr1005({"result":0,"msg":"密码错误","ret_code":1})')
      )
      .mockResolvedValueOnce(
        createFetchResponse('dr1005({"result":0,"msg":"认证成功","ret_code":0})')
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await authService.loginWithAccounts(selectedAccounts, {
      wlanUserIp: '10.0.0.2',
      wlanUserIpv6: undefined,
      wlanUserMac: '001122334455',
    });

    expect(result.success).toBe(true);
    expect(result.accountId).toBe(fallbackAccount.id);
    expect(result.attempts.map((attempt) => attempt.accountId)).toEqual([
      primaryAccount.id,
      fallbackAccount.id,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
