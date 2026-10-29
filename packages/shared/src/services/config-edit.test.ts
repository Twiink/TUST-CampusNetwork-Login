import { describe, expect, it } from 'vitest';
import { createDefaultAppConfig } from '../utils/defaults-factory';
import { editWifi } from './config-edit';

describe('WiFi 安全类型编辑', () => {
  const config = () =>
    createDefaultAppConfig({
      wifiList: [
        {
          id: 'wifi',
          ssid: 'Campus',
          password: 'fixture-passphrase',
          security: 'WPA3',
          autoConnect: true,
          requiresAuth: false,
          linkedAccountIds: [],
          priority: 1,
          lastConnectedAt: null,
        },
      ],
    });
  it('R8: 明确清空不会恢复之前的安全类型，未提供字段则保留', () => {
    expect(editWifi(config(), 'wifi', { security: null }).wifiList[0].security).toBeUndefined();
    expect(editWifi(config(), 'wifi', { priority: 2 }).wifiList[0].security).toBe('WPA3');
    expect(editWifi(config(), 'wifi', { security: 'WPA2' }).wifiList[0].security).toBe('WPA2');
  });
});
