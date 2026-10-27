import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '../constants/defaults';
import type { AccountConfig, AppConfig, WifiConfig } from '../types/config';
import {
  normalizeAppConfig,
  normalizeAppSettings,
  normalizeNotificationSettings,
  normalizeWifiConfig,
  validateAccountConfig,
  validateAppConfig,
  validateAppSettings,
  validateWifiConfig,
} from './validator';

const account: AccountConfig = {
  id: 'a1',
  name: '校园网',
  username: '20260001',
  password: 'secret',
  serverUrl: 'https://netmate.test/login',
  isp: 'campus',
};

const wifi: WifiConfig = {
  id: 'w1',
  ssid: 'TUST-WIFI',
  password: 'wifi-secret',
  autoConnect: true,
  requiresAuth: true,
  linkedAccountIds: ['a1'],
  linkedAccountId: 'a1',
  priority: 10,
  lastConnectedAt: null,
};

describe('normalizeAppSettings', () => {
  it('缺省或非法字段回退到默认值', () => {
    expect(normalizeAppSettings(null)).toMatchObject(DEFAULT_APP_SETTINGS);
    expect(
      normalizeAppSettings({
        heartbeatIntervalSeconds: Number.NaN,
        heartbeatFailureThreshold: Number.POSITIVE_INFINITY,
        autoLaunch: 'yes',
      })
    ).toMatchObject({
      heartbeatIntervalSeconds: DEFAULT_APP_SETTINGS.heartbeatIntervalSeconds,
      heartbeatFailureThreshold: DEFAULT_APP_SETTINGS.heartbeatFailureThreshold,
      autoLaunch: DEFAULT_APP_SETTINGS.autoLaunch,
    });
  });

  it('兼容旧字段 pollingInterval 与 maxRetries，并同步新字段', () => {
    const settings = normalizeAppSettings({
      pollingInterval: 45,
      maxRetries: 4,
    });

    expect(settings.heartbeatIntervalSeconds).toBe(45);
    expect(settings.pollingInterval).toBe(45);
    expect(settings.wifiReconnectRetries).toBe(4);
    expect(settings.maxRetries).toBe(4);
  });

  it('旧版 showNotification 统一映射四个通知开关', () => {
    expect(normalizeAppSettings({ showNotification: false }).notificationSettings).toEqual({
      wifiDisconnected: false,
      reconnectSuccess: false,
      reconnectFailed: false,
      authRecovered: false,
    });
  });

  it('新分项通知设置优先于兼容字段', () => {
    const settings = normalizeAppSettings({
      showNotification: false,
      notificationSettings: {
        wifiDisconnected: true,
        reconnectSuccess: false,
        reconnectFailed: true,
        authRecovered: false,
      },
    });

    expect(settings.notificationSettings).toEqual({
      wifiDisconnected: true,
      reconnectSuccess: false,
      reconnectFailed: true,
      authRecovered: false,
    });
    expect(settings.showNotification).toBe(true);
  });
});

describe('normalizeNotificationSettings', () => {
  it('仅接受布尔字段并保留默认值', () => {
    expect(
      normalizeNotificationSettings({
        wifiDisconnected: false,
        reconnectSuccess: 'true',
      })
    ).toEqual({
      ...DEFAULT_APP_SETTINGS.notificationSettings,
      wifiDisconnected: false,
    });
  });
});

describe('账户验证', () => {
  it('接受合法账户', () => {
    expect(validateAccountConfig(account)).toEqual({ valid: true, errors: [] });
  });

  it('拒绝空白必填字段与错误服务类型', () => {
    const result = validateAccountConfig({
      ...account,
      id: ' ',
      username: '  ',
      password: '',
      isp: 'unknown' as AccountConfig['isp'],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        '账户 ID 不能为空',
        '用户名不能为空',
        '密码不能为空',
        '无效的服务商类型',
      ])
    );
  });

  it('服务器地址只允许 http 或 https', () => {
    for (const serverUrl of [
      'javascript:alert(1)',
      'ftp://netmate.test',
      'not-a-url',
      'http://[::1',
      'http://example.com:99999',
      'http://user@example.com',
    ]) {
      expect(validateAccountConfig({ ...account, serverUrl })).toMatchObject({
        valid: false,
      });
    }
    expect(validateAccountConfig({ ...account, serverUrl: 'http://10.10.102.50:801' }).valid).toBe(
      true
    );
    expect(validateAccountConfig({ ...account, serverUrl: 'http://[::1]:801' }).valid).toBe(true);
  });
});

describe('normalizeWifiConfig', () => {
  it('把旧 linkedAccountId 转为列表并去重', () => {
    const normalized = normalizeWifiConfig({
      id: 'w1',
      ssid: ' TUST-WIFI ',
      linkedAccountId: ' a1 ',
      linkedAccountIds: ['a2', 'a1', 'a2', ' '],
    });

    expect(normalized.ssid).toBe('TUST-WIFI');
    expect(normalized.linkedAccountIds).toEqual(['a2', 'a1']);
    expect(normalized.linkedAccountId).toBe('a2');
  });

  it('无需认证的 WiFi 不保留任何关联账号', () => {
    const normalized = normalizeWifiConfig({
      ...wifi,
      requiresAuth: false,
    });

    expect(normalized.linkedAccountIds).toEqual([]);
    expect(normalized.linkedAccountId).toBeUndefined();
  });
});

describe('WiFi 验证', () => {
  it('允许需要认证但暂未关联账户的配置', () => {
    expect(
      validateWifiConfig({
        ...wifi,
        linkedAccountIds: [],
        linkedAccountId: undefined,
      })
    ).toEqual({ valid: true, errors: [] });
  });

  it('拒绝空白 SSID、非法优先级和兼容字段不一致', () => {
    const result = validateWifiConfig({
      ...wifi,
      ssid: ' ',
      priority: Number.NaN,
      linkedAccountId: 'a2',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'WiFi 名称不能为空',
        '优先级必须是大于等于 0 的数字',
        '兼容关联账号字段与关联账号列表不一致',
      ])
    );
  });
});

describe('设置验证', () => {
  it.each([
    ['heartbeatIntervalSeconds', Number.NaN, '心跳间隔必须大于等于 5 秒'],
    ['heartbeatFailureThreshold', Number.POSITIVE_INFINITY, '连续失败阈值必须大于等于 1'],
    ['wifiReconnectRetries', Number.NaN, 'WiFi 重试次数必须大于等于 0'],
    ['wifiReconnectCooldownMinutes', Number.NEGATIVE_INFINITY, '冷却期必须大于等于 0'],
    ['destroyHiddenWindowAfterMs', -1, '隐藏窗口销毁时间必须大于等于 0'],
  ] as const)('%s 拒绝非有限或越界值', (key, value, message) => {
    const result = validateAppSettings({ [key]: value });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(message);
  });
});

describe('normalizeAppConfig 与 validateAppConfig', () => {
  const raw = {
    accounts: [account],
    currentAccountId: 'missing',
    wifiList: [
      {
        ...wifi,
        linkedAccountIds: ['a1', 'removed-account'],
        linkedAccountId: 'removed-account',
      },
    ],
    settings: {},
  } as unknown as Partial<AppConfig>;

  it('过滤不存在的关联账号并同步兼容字段', () => {
    const normalized = normalizeAppConfig(raw);

    expect(normalized.currentAccountId).toBeNull();
    expect(normalized.wifiList[0].linkedAccountIds).toEqual(['a1']);
    expect(normalized.wifiList[0].linkedAccountId).toBe('a1');
  });

  it('归一化账户时清理 ID、用户名、显示名和服务器地址首尾空白', () => {
    const normalized = normalizeAppConfig({
      accounts: [
        {
          ...account,
          id: ' a1 ',
          name: ' 校园网 ',
          username: ' 20260001 ',
          serverUrl: ' https://netmate.test/login ',
        },
      ],
    });

    expect(normalized.accounts[0]).toMatchObject({
      id: 'a1',
      name: '校园网',
      username: '20260001',
      serverUrl: 'https://netmate.test/login',
    });
  });

  it('归一化后的配置应持续通过完整验证', () => {
    expect(validateAppConfig(normalizeAppConfig(raw))).toEqual({ valid: true, errors: [] });
  });

  it('发现不存在的关联账号与非法当前账户', () => {
    const result = validateAppConfig({
      accounts: [account],
      currentAccountId: 'missing',
      wifiList: [
        {
          ...wifi,
          linkedAccountIds: ['missing'],
          linkedAccountId: 'missing',
        },
      ],
      settings: DEFAULT_APP_SETTINGS,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['当前账户 ID 无效', 'WiFi 1: 关联账号 missing 不存在'])
    );
  });
});
