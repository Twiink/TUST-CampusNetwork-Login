import { describe, it, expect, vi } from 'vitest';
import { ConfigManager } from './ConfigManager';
import { MemoryStorageAdapter } from './StorageAdapter';
import { AccountManager } from './AccountManager';
import { WifiManager } from './WifiManager';
import { AuthService } from './AuthService';
import { resolveLoginAccounts } from './auth-accounts';
import { editAccount, editWifi, moveLinkedAccount } from './config-edit';
import { createDefaultAppConfig, normalizeAppConfig } from '../utils/validator';
import { createLogger } from '../models/Logger';
import { buildLoginUrl } from './auth-protocol';
import samples from '../../fixtures/portal-protocol.json';
import type { AccountConfig } from '../types/config';

const account: AccountConfig = {
  id: 'a1',
  name: 'One',
  username: '20260001',
  password: 'keep-secret',
  serverUrl: 'http://portal.test',
  isp: 'campus',
};
const wifi = {
  id: 'w1',
  ssid: 'TUST-WIFI',
  password: 'keep-wifi',
  priority: 10,
  autoConnect: true,
  requiresAuth: true,
  linkedAccountIds: ['a1'],
  lastConnectedAt: null,
};

describe('审查回归：配置、认证与脱敏', () => {
  it('账号、WiFi 和设置同时提交时串行合并，发布发生在落盘之后', async () => {
    const storage = new MemoryStorageAdapter();
    const config = new ConfigManager(storage);
    await config.load();
    const originalSet = storage.set.bind(storage);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(storage, 'set').mockImplementationOnce(async (key, value) => {
      await gate;
      await originalSet(key, value);
    });
    const notify = vi.fn();
    config.subscribe(notify);
    const accounts = new AccountManager(config);
    const networks = new WifiManager(config);
    const first = accounts.addAccount({ ...account });
    const second = networks.addWifi({ ...wifi });
    const third = config.updateSettings({ autoAuthPaused: true });
    await Promise.resolve();
    expect(notify).not.toHaveBeenCalled();
    release();
    await Promise.all([first, second, third]);
    expect(config.getConfig()).toMatchObject({
      revision: 3,
      accounts: [expect.objectContaining({ username: account.username })],
      wifiList: [expect.objectContaining({ ssid: wifi.ssid })],
      settings: { autoAuthPaused: true },
    });
    expect(await storage.get('app_config')).toEqual(config.getConfig());
    expect(notify.mock.calls.map(([next]) => next.revision)).toEqual([1, 2, 3]);
  });

  it('保存失败不发布，后续提交仍能完成，旧 revision 被拒绝', async () => {
    const storage = new MemoryStorageAdapter();
    const config = new ConfigManager(storage);
    await config.load();
    const before = config.getConfig()!;
    vi.spyOn(storage, 'set').mockRejectedValueOnce(new Error('disk full'));
    await expect(config.updateSettings({ autoAuthPaused: true })).rejects.toThrow('disk full');
    expect(config.getConfig()).toEqual(before);
    await config.updateSettings({ autoAuthPaused: true });
    await expect(config.save(before)).rejects.toThrow('配置已更新');
    const restarted = new ConfigManager(storage);
    await restarted.load();
    expect(restarted.getSettings().autoAuthPaused).toBe(true);
    expect(
      normalizeAppConfig({ ...before, settings: { autoReconnect: true } }).settings.autoAuthPaused
    ).toBe(false);
  });

  it('账号解析按有效关联顺序，全部失效时才回退当前账号', () => {
    const second = { ...account, id: 'a2', username: 'second' };
    const config = createDefaultAppConfig({
      accounts: [account, second],
      currentAccountId: 'a1',
      wifiList: [{ ...wifi, linkedAccountIds: ['missing', 'a2', 'a1'] }],
    });
    expect(resolveLoginAccounts(config, wifi.ssid).map((value) => value.id)).toEqual(['a2', 'a1']);
    config.wifiList[0].linkedAccountIds = ['missing'];
    expect(resolveLoginAccounts(config, wifi.ssid)).toEqual([account]);
  });

  it('恢复原生较新暂停状态时版本保持递增，后续修改不会被拒绝', async () => {
    const config = new ConfigManager(new MemoryStorageAdapter());
    await config.load();
    await config.update((current) => ({
      revision: 20,
      settings: { ...current.settings, autoAuthPaused: true },
    }));
    expect(config.getConfig()?.revision).toBe(21);
    await config.updateSettings({ autoAuthPaused: false });
    expect(config.getConfig()?.revision).toBe(22);
  });

  it('单个账号抛异常后继续备用账号，串行注销最后执行', async () => {
    const service = new AuthService();
    vi.spyOn(service, 'login')
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ success: true, message: 'ok' });
    const result = await service.loginWithAccounts([account, { ...account, id: 'a2' }], {
      wlanUserIp: '10.1.2.3',
    });
    expect(result.attempts.map((item) => item.success)).toEqual([false, true]);
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const login = service.runExclusive(async () => {
      await gate;
      order.push('login');
    });
    const logout = service.runExclusive(async () => {
      order.push('logout');
    });
    expect(order).toEqual([]);
    release();
    await Promise.all([login, logout]);
    expect(order).toEqual(['login', 'logout']);
  });

  it('编辑保留 ID、密码及关联，并支持显式清除 WiFi 密码和排序', () => {
    const config = createDefaultAppConfig({
      accounts: [account],
      currentAccountId: account.id,
      wifiList: [wifi],
    });
    const edited = editAccount(config, 'a1', {
      username: 'changed',
      password: '',
      name: 'Changed',
      serverUrl: account.serverUrl,
      isp: 'cucc',
    });
    expect(edited.accounts[0]).toMatchObject({
      id: 'a1',
      password: 'keep-secret',
      username: 'changed',
    });
    expect(edited.wifiList[0].linkedAccountIds).toEqual(['a1']);
    const open = editWifi(edited, 'w1', { ...wifi, ssid: 'Renamed', password: '' }, '', true);
    expect(open.wifiList[0]).toMatchObject({
      id: 'w1',
      password: '',
      security: 'Open',
      linkedAccountIds: ['a1'],
    });
    expect(() => editWifi(edited, 'w1', { priority: 100 })).toThrow('1–99');
    expect(moveLinkedAccount(['a1', 'a2'], 'a2', -1)).toEqual(['a2', 'a1']);
  });

  it('密码在内存、监听器与导出前统一脱敏', () => {
    const logger = createLogger();
    const listener = vi.fn();
    logger.addListener(listener);
    logger.error('command password "wifi-secret" user_password=portal-secret', {
      nested: { password: 'nested-secret' },
      error: new Error('netsh password=error-secret'),
    });
    logger.error('http://portal.test/eportal/portal/login?user_password=url-secret');
    logger.error('{"password":"json secret"}');
    for (const value of [
      JSON.stringify(logger.getLogs()),
      JSON.stringify(listener.mock.calls),
      logger.exportAsText(),
      logger.exportAsJson(),
    ]) {
      for (const secret of [
        'wifi-secret',
        'portal-secret',
        'nested-secret',
        'error-secret',
        'url-secret',
        'json secret',
        '/eportal/portal/login',
      ])
        expect(value).not.toContain(secret);
    }
    logger.stopAutoCleanup();
  });
});

describe('TypeScript / Kotlin 共享协议样例', () => {
  for (const sample of samples)
    it(sample.isp, () => {
      expect(
        buildLoginUrl('http://portal.test/', {
          userAccount: sample.username,
          userPassword: sample.password,
          isp: sample.isp as AccountConfig['isp'],
          wlanUserIp: sample.ipv4,
          wlanUserIpv6: sample.ipv6 ?? undefined,
        })
      ).toBe(sample.url);
    });
});
