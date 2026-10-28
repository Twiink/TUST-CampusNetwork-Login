import { describe, it, expect } from 'vitest';
import { matchWifiRule } from './wifi-identity';
import { resolveLoginAccounts } from './auth-accounts';
import { createDefaultAppConfig, createDefaultWifiConfig } from '../utils/validator';

describe('同名 WiFi 身份匹配', () => {
  const generic = {
    ...createDefaultWifiConfig(),
    id: 'generic',
    ssid: 'Campus',
    priority: 1,
    security: undefined,
  };
  const secure = { ...generic, id: 'secure', security: 'WPA2-Personal', priority: 2 };
  const pinned = { ...secure, id: 'pinned', bssid: 'AA:BB:CC:DD:EE:FF', priority: 3 };
  it('BSSID 和安全类型优先于普通规则，字段规范化后匹配', () => {
    expect(
      matchWifiRule([generic, secure, pinned], {
        ssid: 'Campus',
        security: 'WPA2',
        bssid: 'aa-bb-cc-dd-ee-ff',
      })?.id
    ).toBe('pinned');
    expect(matchWifiRule([generic, secure], { ssid: 'Campus', security: 'WPA2' })?.id).toBe(
      'secure'
    );
    expect(matchWifiRule([generic, secure, pinned], { ssid: 'Campus', security: 'Open' })?.id).toBe(
      'generic'
    );
  });
  it('身份不匹配或信息不足不套用已知其他网络的账号', () => {
    const config = createDefaultAppConfig({
      wifiList: [pinned],
      accounts: [
        {
          id: 'a',
          name: 'a',
          username: 'fixture',
          password: 'fixture',
          isp: 'campus',
          serverUrl: 'http://portal.test',
        },
      ],
      currentAccountId: 'a',
    });
    expect(resolveLoginAccounts(config, 'Campus')).toEqual([]);
    expect(
      resolveLoginAccounts(config, { ssid: 'Campus', security: 'Open', bssid: pinned.bssid })
    ).toEqual([]);
    expect(
      resolveLoginAccounts(config, { ssid: 'Campus', security: 'WPA2', bssid: pinned.bssid })
    ).toHaveLength(1);
  });
});

it('missing BSSID blocks ambiguous fallback, while explicit transition rules accept the negotiated WPA2/WPA3 mode', () => {
  const base = { ...createDefaultWifiConfig(), ssid: 'Campus', id: 'plain', security: undefined };
  const pinned = { ...base, id: 'pin', bssid: 'aa:bb:cc:dd:ee:ff' };
  expect(matchWifiRule([base, pinned], { ssid: 'Campus' })).toBeNull();
  expect(matchWifiRule([base, pinned], { ssid: 'Campus', bssid: 'aa:bb:cc:dd:ee:01' })?.id).toBe(
    'plain'
  );
  for (const security of ['WPA2', 'WPA3'])
    expect(
      matchWifiRule([{ ...base, security: 'WPA2-WPA3' }], { ssid: 'Campus', security })
    ).not.toBeNull();
});
