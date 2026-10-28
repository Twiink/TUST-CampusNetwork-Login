import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const state = vi.hoisted(() => ({
  directory: '',
  available: true,
  backend: 'gnome_libsecret',
  decryptFails: false,
}));
vi.mock('electron', () => ({
  app: { getPath: () => state.directory },
  safeStorage: {
    isEncryptionAvailable: () => state.available,
    getSelectedStorageBackend: () => state.backend,
    encryptString: (value: string) => Buffer.from(value.split('').reverse().join('')),
    decryptString: (value: Buffer) => {
      if (state.decryptFails) throw new Error('unavailable');
      return value.toString().split('').reverse().join('');
    },
  },
}));
import { ElectronStorageAdapter } from './store';
describe('安全存储与失败恢复', () => {
  beforeEach(async () => {
    state.directory = await mkdtemp(path.join(tmpdir(), 'netmate-store-'));
    state.available = true;
    state.backend = 'gnome_libsecret';
    state.decryptFails = false;
  });
  afterEach(async () => {
    await rm(state.directory, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  const file = () => path.join(state.directory, 'config.json');
  it('加密往返、原子更新和仅当前用户可读写', async () => {
    await new ElectronStorageAdapter().set('accounts', [{ password: 'fixture-password' }]);
    expect(await readFile(file(), 'utf8')).not.toContain('fixture-password');
    expect(await new ElectronStorageAdapter().get('accounts')).toEqual([
      { password: 'fixture-password' },
    ]);
    if (process.platform !== 'win32') expect((await stat(file())).mode & 0o777).toBe(0o600);
  });
  it('Linux basic_text 后端不属于安全加密', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    state.backend = 'basic_text';
    await expect(new ElectronStorageAdapter().set('password', 'fixture')).rejects.toThrow('钥匙串');
    await expect(readFile(file())).rejects.toThrow();
  });
  it('历史明文只有成功加密后才能加载，失败保留文件并可恢复', async () => {
    const original = JSON.stringify({ account: { password: 'legacy-fixture' } });
    await writeFile(file(), original);
    state.available = false;
    const store = new ElectronStorageAdapter();
    await expect(store.get('account')).rejects.toThrow('钥匙串');
    expect(await readFile(file(), 'utf8')).toBe(original);
    state.available = true;
    expect(await store.get('account')).toEqual({ password: 'legacy-fixture' });
    expect(await readFile(file(), 'utf8')).not.toContain('legacy-fixture');
  });
  it('解密失败拒绝加载、修改和清空，恢复后仍可读取', async () => {
    await new ElectronStorageAdapter().set('password', 'fixture');
    const original = await readFile(file(), 'utf8');
    state.decryptFails = true;
    const store = new ElectronStorageAdapter();
    await expect(store.get('password')).rejects.toThrow('无法解密');
    await expect(store.set('name', 'new')).rejects.toThrow();
    await expect(store.clear()).rejects.toThrow();
    expect(await readFile(file(), 'utf8')).toBe(original);
    state.decryptFails = false;
    expect(await store.get('password')).toBe('fixture');
  });
  it('损坏配置不会被默认值覆盖', async () => {
    await writeFile(file(), 'broken-json');
    const store = new ElectronStorageAdapter();
    await expect(store.set('app_config', {})).rejects.toThrow('已保留');
    expect(await readFile(file(), 'utf8')).toBe('broken-json');
  });
  it('保存失败不发布内存值，队列可在恢复后继续提交', async () => {
    const store = new ElectronStorageAdapter();
    await store.set('password', 'old-fixture');
    const original = await readFile(file(), 'utf8');
    state.available = false;
    await expect(store.set('password', 'new-fixture')).rejects.toThrow('钥匙串');
    expect(await store.get('password')).toBe('old-fixture');
    expect(await readFile(file(), 'utf8')).toBe(original);
    state.available = true;
    await store.set('password', 'new-fixture');
    expect(await store.get('password')).toBe('new-fixture');
  });
});
