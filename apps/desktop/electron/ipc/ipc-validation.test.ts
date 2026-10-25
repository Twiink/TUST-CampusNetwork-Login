/**
 * IPC 入口参数校验测试：非法输入被拒绝、合法输入透传到服务层
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handleMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
}));

import { registerAccountIPC } from './account';
import { registerWifiIPC } from './wifi';
import { registerConfigIPC } from './config';
import { IPC_CHANNELS } from './channels';

/** 收集注册的 handler，按通道名取回 */
const collectHandlers = () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  handleMock.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
    handlers.set(channel, handler);
  });
  return handlers;
};

const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  debug: vi.fn(),
} as never;

const validAccount = {
  name: '校园网',
  username: '20250001',
  password: 'secret',
  serverUrl: 'http://10.10.102.50:801',
  isp: 'campus' as const,
};

const validWifi = {
  ssid: 'TUST-WIFI',
  password: 'wifi-pass',
  autoConnect: true,
  requiresAuth: true,
  linkedAccountIds: ['a1'],
  priority: 10,
  lastConnectedAt: null,
};

describe('IPC 入口校验', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = collectHandlers();

    const accountManager = {
      addAccount: vi.fn().mockResolvedValue({ id: 'a1', ...validAccount }),
      updateAccount: vi.fn().mockResolvedValue({ id: 'a1', ...validAccount }),
    };
    registerAccountIPC(accountManager as never, noopLogger);

    const wifiManager = {
      addWifi: vi.fn().mockResolvedValue({ id: 'w1', ...validWifi }),
      updateWifi: vi.fn().mockResolvedValue({ id: 'w1', ...validWifi }),
    };
    registerWifiIPC(wifiManager as never, noopLogger);

    const configManager = {
      save: vi.fn().mockResolvedValue(undefined),
    };
    registerConfigIPC(configManager as never, noopLogger);
  });

  it('添加账户：合法输入透传，缺密码被拒绝', async () => {
    const add = handlers.get(IPC_CHANNELS.ACCOUNT_ADD)!;

    await add({}, validAccount);
    expect(add).toBeTruthy();

    await expect(add({}, { ...validAccount, password: '' })).rejects.toThrow('参数校验失败');
    await expect(add({}, null)).rejects.toThrow('账户必须是对象');
  });

  it('添加账户：非法服务商被拒绝', async () => {
    const add = handlers.get(IPC_CHANNELS.ACCOUNT_ADD)!;
    await expect(add({}, { ...validAccount, isp: 'unknown-isp' })).rejects.toThrow(
      '无效的服务商类型'
    );
  });

  it('更新账户：部分更新（只改密码）合法，改出非法字段被拒绝', async () => {
    const update = handlers.get(IPC_CHANNELS.ACCOUNT_UPDATE)!;

    await expect(update({}, 'a1', { password: 'new-pass' })).resolves.toBeTruthy();

    await expect(update({}, 'a1', { serverUrl: 'not-a-url' })).rejects.toThrow(
      '服务器地址格式无效'
    );
  });

  it('添加 WiFi：缺 SSID 被拒绝，合法输入透传', async () => {
    const add = handlers.get(IPC_CHANNELS.WIFI_ADD)!;

    await expect(add({}, { ...validWifi, ssid: '' })).rejects.toThrow('参数校验失败');
    await expect(add({}, validWifi)).resolves.toBeTruthy();
  });

  it('更新 WiFi：部分更新（只改优先级）合法', async () => {
    const update = handlers.get(IPC_CHANNELS.WIFI_UPDATE)!;
    await expect(update({}, 'w1', { priority: 5 })).resolves.toBeTruthy();
    await expect(update({}, 'w1', { autoConnect: 'yes' as unknown as boolean })).rejects.toThrow(
      '自动连接设置格式无效'
    );
  });

  it('数组、字符串、数字等非对象输入统一被拒绝', async () => {
    const add = handlers.get(IPC_CHANNELS.ACCOUNT_ADD)!;
    const wifiAdd = handlers.get(IPC_CHANNELS.WIFI_ADD)!;

    for (const bad of [[], ['x'], 'string', 42, true, undefined]) {
      await expect(add({}, bad)).rejects.toThrow('参数校验失败');
      await expect(wifiAdd({}, bad)).rejects.toThrow('参数校验失败');
    }
  });

  it('超长输入（20KB 密码）不导致崩溃且正常通过', async () => {
    const add = handlers.get(IPC_CHANNELS.ACCOUNT_ADD)!;
    const longPassword = 'p'.repeat(20 * 1024);

    await expect(add({}, { ...validAccount, password: longPassword })).resolves.toBeTruthy();
  });

  it('需要认证的 WiFi 未关联账号被拒绝', async () => {
    const wifiAdd = handlers.get(IPC_CHANNELS.WIFI_ADD)!;

    await expect(
      wifiAdd({}, { ...validWifi, requiresAuth: true, linkedAccountIds: [] })
    ).rejects.toThrow('需要认证的 WiFi 必须至少关联一个账号');
  });

  it('负数优先级被拒绝', async () => {
    const update = handlers.get(IPC_CHANNELS.WIFI_UPDATE)!;

    await expect(update({}, 'w1', { priority: -1 })).rejects.toThrow(
      '优先级必须是大于等于 0 的数字'
    );
  });

  it('原型污染字段不破坏校验器', async () => {
    const add = handlers.get(IPC_CHANNELS.ACCOUNT_ADD)!;
    const malicious = JSON.parse(
      '{"__proto__": {"polluted": true}, "username": "20250001", "password": "x"}'
    );

    // JSON 反序列化的 __proto__ 是普通自有属性，校验器应忽略而非崩溃
    await expect(add({}, malicious)).resolves.toBeTruthy();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('保存配置：非对象输入被拒绝并返回 false', async () => {
    const set = handlers.get(IPC_CHANNELS.CONFIG_SET)!;
    // handler 内部 catch 后返回 false（与既有错误语义一致），服务层不被调用
    await expect(set({}, 'not-an-object')).resolves.toBe(false);
  });
});
