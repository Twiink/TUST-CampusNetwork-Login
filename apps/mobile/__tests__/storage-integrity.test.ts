import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConfigManager, MemoryStorageAdapter, createDefaultAppConfig } from '@repo/shared';
import { createSecureStorage } from '../src/services/secureStorage';
import { createReactNativeStorage } from '../src/context/mobileServices';

const account = (id: string) => ({
  id,
  name: id,
  username: id,
  password: 'fixture-' + id,
  serverUrl: 'http://portal.test',
  isp: 'campus' as const,
});
const original = () =>
  createDefaultAppConfig({
    accounts: [account('first'), account('second')],
    currentAccountId: 'first',
  });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.requireMock('react-native-keychain').__storeForTests.clear();
});

test('failed JSON commit preserves credentials referenced by the previous config', async () => {
  const inner = new MemoryStorageAdapter();
  const storage = createSecureStorage(inner);
  await storage.set('app_config', original());
  const before = await inner.get('app_config');
  jest.spyOn(inner, 'set').mockRejectedValueOnce(new Error('fixture disk full'));
  await expect(
    storage.set(
      'app_config',
      createDefaultAppConfig({
        accounts: [account('second')],
        currentAccountId: 'second',
      })
    )
  ).rejects.toThrow('fixture disk full');
  expect(await inner.get('app_config')).toEqual(before);
  const reloaded = await storage.get<ReturnType<typeof original>>('app_config');
  expect(reloaded?.accounts.map(item => [item.id, item.password])).toEqual([
    ['first', 'fixture-first'],
    ['second', 'fixture-second'],
  ]);
});

test('temporary keychain read errors preserve all stored accounts', async () => {
  const inner = new MemoryStorageAdapter();
  const storage = createSecureStorage(inner);
  await storage.set('app_config', original());
  (Keychain.getGenericPassword as jest.Mock).mockRejectedValueOnce(
    new Error('fixture temporarily locked')
  );
  const manager = new ConfigManager(storage);
  const before = await inner.get('app_config');
  await expect(manager.load()).rejects.toThrow('fixture temporarily locked');
  expect(await inner.get('app_config')).toEqual(before);
  expect((await manager.load()).accounts).toEqual(original().accounts);
});

test('AsyncStorage read and JSON errors do not replace saved config', async () => {
  const storage = createReactNativeStorage();
  await storage.set('app_config', original());
  (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('fixture temporary I/O'));
  const manager = new ConfigManager(storage);
  await expect(manager.load()).rejects.toThrow('fixture temporary I/O');
  expect((await manager.load()).accounts).toEqual(original().accounts);
  (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('{broken');
  await expect(new ConfigManager(storage).load()).rejects.toThrow();
  expect((await storage.get<ReturnType<typeof original>>('app_config'))?.accounts).toEqual(
    original().accounts
  );
});

test.each(['null', '{broken'])(
  'existing stored value %s is preserved and reported as invalid',
  async raw => {
    await AsyncStorage.setItem('app_config', raw);
    await expect(new ConfigManager(createReactNativeStorage()).load()).rejects.toThrow();
    expect(await AsyncStorage.getItem('app_config')).toBe(raw);
  }
);

test('R1: 保存主题后仍可修改配置和跨重启读取，清空配置不会删除主题', async () => {
  await AsyncStorage.setItem('netmate_theme_mode', 'dark');
  const storage = createSecureStorage(createReactNativeStorage());
  const first = new ConfigManager(storage);
  await first.load();
  await first.save(original());
  await AsyncStorage.setItem('netmate_theme_mode', 'light');
  await first.save({
    ...first.getConfig()!,
    settings: { ...first.getSettings(), wifiReconnectRetries: 7 },
  });
  const restored = new ConfigManager(createSecureStorage(createReactNativeStorage()));
  expect((await restored.load()).accounts).toEqual(original().accounts);
  expect(restored.getSettings().wifiReconnectRetries).toBe(7);
  await storage.clear();
  expect(await AsyncStorage.getItem('app_config')).toBeNull();
  expect(await AsyncStorage.getItem('netmate_theme_mode')).toBe('light');
});
