/**
 * 安全存储装饰器测试：加密往返、旧明文迁移、条目缺失回退、remove/clear 清理
 */

import * as Keychain from 'react-native-keychain';
import { createSecureStorage } from './secureStorage';
import type { StorageAdapter } from '@repo/shared';

const createInner = (): StorageAdapter => {
  const store = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return (store.get(key) as T) ?? null;
    },
    async set<T>(key: string, value: T) {
      store.set(key, value);
    },
    async remove(key: string) {
      store.delete(key);
    },
    async clear() {
      store.clear();
    },
    async keys() {
      return [...store.keys()];
    },
  };
};

const sampleConfig = {
  accounts: [
    {
      id: 'a1',
      name: '校园网',
      username: '20250001',
      password: 'secret-pass',
      serverUrl: 'http://x',
    },
  ],
  wifiList: [{ id: 'w1', ssid: 'TUST-WIFI', password: 'wifi-pass' }],
  settings: { heartbeatInterval: 30 },
};

const resetKeychainStore = () => {
  (
    require('react-native-keychain') as { __storeForTests: Map<string, unknown> }
  ).__storeForTests.clear();
};

describe('createSecureStorage', () => {
  let storage: StorageAdapter;
  let inner: StorageAdapter;

  beforeEach(() => {
    resetKeychainStore();
    inner = createInner();
    storage = createSecureStorage(inner);
  });

  it('set 后明文不落盘，get 返回真实密码', async () => {
    await storage.set('app_config', sampleConfig);

    const persisted = await inner.get<typeof sampleConfig>('app_config');
    expect(JSON.stringify(persisted)).not.toContain('secret-pass');
    expect(JSON.stringify(persisted)).not.toContain('wifi-pass');
    expect(persisted?.accounts[0].password).toMatch(/^__keychain__:/);
    expect(persisted?.wifiList[0].password).toMatch(/^__keychain__:/);

    const loaded = await storage.get<typeof sampleConfig>('app_config');
    expect(loaded?.accounts[0].password).toBe('secret-pass');
    expect(loaded?.wifiList[0].password).toBe('wifi-pass');
    expect(loaded?.settings.heartbeatInterval).toBe(30);
  });

  it('旧明文数据原样读取（惰性迁移），下次保存后进入 keychain', async () => {
    await inner.set('app_config', sampleConfig);

    const firstRead = await storage.get<typeof sampleConfig>('app_config');
    expect(firstRead?.accounts[0].password).toBe('secret-pass');

    // 模拟 ConfigManager 回写：保存后明文应被抽出
    await storage.set('app_config', firstRead);
    const persisted = await inner.get<typeof sampleConfig>('app_config');
    expect(persisted?.accounts[0].password).toMatch(/^__keychain__:/);

    const secondRead = await storage.get<typeof sampleConfig>('app_config');
    expect(secondRead?.accounts[0].password).toBe('secret-pass');
  });

  it('keychain 条目丢失时回退为空字符串而非占位符', async () => {
    await storage.set('app_config', sampleConfig);
    const persisted = await inner.get<typeof sampleConfig>('app_config');
    const service = (persisted?.accounts[0].password as string).replace('__keychain__:', '');
    await Keychain.resetGenericPassword({ service });

    const loaded = await storage.get<typeof sampleConfig>('app_config');
    expect(loaded?.accounts[0].password).toBe('');
  });

  it('remove 时清理对应 keychain 条目', async () => {
    await storage.set('app_config', sampleConfig);
    const persisted = await inner.get<typeof sampleConfig>('app_config');
    const services = [
      (persisted?.accounts[0].password as string).replace('__keychain__:', ''),
      (persisted?.wifiList[0].password as string).replace('__keychain__:', ''),
    ];

    await storage.remove('app_config');

    for (const service of services) {
      const entry = await Keychain.getGenericPassword({ service });
      expect(entry).toBe(false);
    }
    expect(await inner.get('app_config')).toBeNull();
  });

  it('删除账户后保存，其 keychain 条目被孤儿清理', async () => {
    await storage.set('app_config', sampleConfig);
    const persisted = await inner.get<typeof sampleConfig>('app_config');
    const removedService = (persisted?.accounts[0].password as string).replace('__keychain__:', '');

    const nextConfig = { ...sampleConfig, accounts: [] };
    await storage.set('app_config', nextConfig);

    expect(await Keychain.getGenericPassword({ service: removedService })).toBe(false);
    // wifi 密码条目仍保留
    const wifiService = (persisted?.wifiList[0].password as string).replace('__keychain__:', '');
    const wifiEntry = await Keychain.getGenericPassword({ service: wifiService });
    expect(wifiEntry !== false && wifiEntry.password).toBe('wifi-pass');
  });

  it('clear 清空全部 keychain 条目与索引', async () => {
    await storage.set('app_config', sampleConfig);
    await storage.clear();

    const store = (require('react-native-keychain') as { __storeForTests: Map<string, unknown> })
      .__storeForTests;
    expect(store.size).toBe(0);
    expect(await inner.keys()).toEqual([]);
  });

  it('keychain 写入失败时 set 抛错且不落盘半成品', async () => {
    const { setGenericPassword } = jest.requireMock('react-native-keychain');
    setGenericPassword.mockRejectedValueOnce(new Error('keystore unavailable'));

    await expect(storage.set('app_config', sampleConfig)).rejects.toThrow('keystore unavailable');
    // 内层存储未写入（保持原值/为空），避免出现占位符指向不存在的 keychain 条目
    expect(await inner.get('app_config')).toBeNull();
  });

  it('keychain 读取抛错时回退为空字符串', async () => {
    await storage.set('app_config', sampleConfig);

    const { getGenericPassword } = jest.requireMock('react-native-keychain');
    getGenericPassword.mockRejectedValueOnce(new Error('read failed'));

    const loaded = await storage.get<typeof sampleConfig>('app_config');
    expect(loaded?.accounts[0].password).toBe('');
  });

  it('深层嵌套的 userPassword 字段同样被保护', async () => {
    const config = {
      module: { deep: { list: [{ userPassword: 'nested-secret' }] } },
    };
    await storage.set('app_config', config);

    const persisted = await inner.get<typeof config>('app_config');
    const ref = persisted?.module.deep.list[0].userPassword as string;
    expect(ref).toMatch(/^__keychain__:/);

    const loaded = await storage.get<typeof config>('app_config');
    expect(loaded?.module.deep.list[0].userPassword).toBe('nested-secret');
  });

  it('非对象值（字符串/数组/null）直接透传不加密', async () => {
    await storage.set('plain_key', 'hello');
    await storage.set('arr_key', [1, 2, 3]);
    await storage.set('null_key', null);

    expect(await storage.get('plain_key')).toBe('hello');
    expect(await storage.get('arr_key')).toEqual([1, 2, 3]);
    expect(await storage.get('null_key')).toBeNull();
    expect(await storage.get('missing_key')).toBeNull();
  });

  it('同一配置反复保存，旧引用条目被清理不累积', async () => {
    await storage.set('app_config', sampleConfig);

    // 第二次保存带新密码（数组顺序不变 → 引用相同），随后删除账户
    const next = {
      ...sampleConfig,
      accounts: [{ ...sampleConfig.accounts[0], password: 'rotated-pass' }],
    };
    await storage.set('app_config', next);

    const { __storeForTests } = jest.requireMock('react-native-keychain');
    const secretServices = [...__storeForTests.keys()].filter((k: string) =>
      String(k).includes('accounts.0.password')
    );
    // 只保留最新一条密码，旧的被孤儿清理
    expect(secretServices).toHaveLength(1);
    const loaded = await storage.get<typeof next>('app_config');
    expect(loaded?.accounts[0].password).toBe('rotated-pass');
  });

  it('空密码保持内联原样，不产生占位符', async () => {
    const config = { accounts: [{ id: 'a2', name: 'x', username: 'u', password: '' }] };
    await storage.set('app_config', config);
    const persisted = await inner.get<typeof config>('app_config');
    expect(persisted?.accounts[0].password).toBe('');
  });
});
