import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultAppConfig, type AccountConfig, type AppConfig } from '@repo/shared';
import { Settings } from './Settings';
import type { ConfigUpdate } from '../hooks/useConfig';

const { useAppMock } = vi.hoisted(() => ({
  useAppMock: vi.fn(),
}));

vi.mock('../context/AppContext', () => ({
  useApp: useAppMock,
}));

const firstAccount: AccountConfig = {
  id: 'a1',
  name: '账号一',
  username: '20250001',
  password: 'secret-1',
  serverUrl: 'http://10.10.102.50:801',
  isp: 'campus',
};

const secondAccount: AccountConfig = {
  id: 'a2',
  name: '账号二',
  username: '20250002',
  password: 'secret-2',
  serverUrl: 'http://10.10.102.50:801',
  isp: 'cmcc',
};

function makeConfig(): AppConfig {
  const base = createDefaultAppConfig();
  return {
    ...base,
    accounts: [firstAccount, secondAccount],
    currentAccountId: firstAccount.id,
    wifiList: [
      {
        id: 'w1',
        ssid: 'TUST-WIFI',
        password: 'wifi-pass',
        autoConnect: true,
        requiresAuth: true,
        linkedAccountIds: [firstAccount.id, secondAccount.id],
        linkedAccountId: firstAccount.id,
        priority: 1,
        lastConnectedAt: null,
      },
    ],
  };
}

describe('Settings', () => {
  const setConfig = vi.fn<(update: ConfigUpdate) => Promise<void>>();

  function renderSettings(config = makeConfig()) {
    useAppMock.mockReturnValue({ config, setConfig });
    return render(<Settings />);
  }

  function savedConfig(callIndex = 0, base = makeConfig()): AppConfig {
    const update = setConfig.mock.calls[callIndex]?.[0];
    if (!update) {
      throw new Error(`缺少第 ${callIndex + 1} 次配置更新`);
    }
    return typeof update === 'function' ? update(base) : update;
  }

  beforeEach(() => {
    setConfig.mockReset();
    setConfig.mockResolvedValue(undefined);
    useAppMock.mockReset();
  });

  it('拒绝空白、重复用户名和非 HTTP(S) 服务器地址', async () => {
    renderSettings();
    const submit = screen.getByRole('button', { name: '保存并添加账号' });

    fireEvent.click(submit);
    expect((await screen.findByRole('alert')).textContent).toContain('请输入用户名和密码');

    fireEvent.change(screen.getByLabelText('用户名'), {
      target: { value: firstAccount.username },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'password' },
    });
    fireEvent.click(submit);
    expect((await screen.findByRole('alert')).textContent).toContain('该用户名已存在');

    fireEvent.change(screen.getByLabelText('用户名'), {
      target: { value: '20250003' },
    });
    fireEvent.change(screen.getByLabelText('登录服务器地址'), {
      target: { value: 'ftp://10.10.102.50' },
    });
    fireEvent.click(submit);
    expect((await screen.findByRole('alert')).textContent).toContain(
      '服务器地址格式无效，仅支持 http:// 或 https://'
    );
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('添加账号时去除首尾空白、生成 ID，并把首个账号设为当前账号', async () => {
    const config = makeConfig();
    config.accounts = [];
    config.currentAccountId = null;
    config.wifiList = [];
    renderSettings(config);

    fireEvent.change(screen.getByLabelText('用户名'), {
      target: { value: '  20250003  ' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'new-secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存并添加账号' }));

    await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(1));
    const saved = savedConfig(0, config);
    expect(saved.accounts).toHaveLength(1);
    expect(saved.accounts[0]).toMatchObject({
      name: '20250003',
      username: '20250003',
      password: 'new-secret',
      serverUrl: 'http://10.10.102.50:801',
    });
    expect(saved.accounts[0].id).toBeTruthy();
    expect(saved.currentAccountId).toBe(saved.accounts[0].id);
    expect((screen.getByLabelText('用户名') as HTMLInputElement).value).toBe('');
  });

  it('删除账号时清理两种关联字段并切换当前账号', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: `删除账号 ${firstAccount.username}` }));

    await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(1));
    const saved = savedConfig();
    expect(saved.accounts).toEqual([secondAccount]);
    expect(saved.currentAccountId).toBe(secondAccount.id);
    expect(saved.wifiList[0].linkedAccountIds).toEqual([secondAccount.id]);
    expect(saved.wifiList[0].linkedAccountId).toBe(secondAccount.id);
  });

  it('删除最后一个关联账号时仍允许保存认证 WiFi', async () => {
    const config = makeConfig();
    config.accounts = [firstAccount];
    config.currentAccountId = firstAccount.id;
    config.wifiList[0].linkedAccountIds = [firstAccount.id];
    config.wifiList[0].linkedAccountId = firstAccount.id;
    renderSettings(config);

    fireEvent.click(screen.getByRole('button', { name: `删除账号 ${firstAccount.username}` }));

    await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(1));
    const saved = savedConfig(0, config);
    expect(saved.accounts).toEqual([]);
    expect(saved.currentAccountId).toBeNull();
    expect(saved.wifiList[0]).toMatchObject({
      ssid: 'TUST-WIFI',
      requiresAuth: true,
      linkedAccountIds: [],
      linkedAccountId: undefined,
    });
  });

  it('WiFi 表单拒绝重复 SSID、空 SSID 和未关联账号', async () => {
    renderSettings();
    const submit = screen.getByRole('button', { name: '添加 WiFi' });

    fireEvent.change(screen.getByLabelText('WiFi 名称'), {
      target: { value: firstAccount.username },
    });
    fireEvent.click(submit);
    expect((await screen.findByRole('alert')).textContent).toContain(
      '需要认证的 WiFi 必须选择关联账号'
    );

    fireEvent.change(screen.getByLabelText('WiFi 名称'), {
      target: { value: 'TUST-WIFI' },
    });
    fireEvent.click(screen.getByRole('button', { name: `选择账号 ${firstAccount.username}` }));
    fireEvent.click(submit);
    expect((await screen.findByRole('alert')).textContent).toContain('该 WiFi 配置已存在');

    fireEvent.change(screen.getByLabelText('WiFi 名称'), { target: { value: '   ' } });
    fireEvent.click(submit);
    expect((await screen.findByRole('alert')).textContent).toContain('请输入 WiFi 名称');
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('添加 WiFi 时写入兼容关联字段并清空表单', async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('WiFi 名称'), {
      target: { value: '  TUST-LAB  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: `选择账号 ${secondAccount.username}` }));
    fireEvent.click(screen.getByRole('button', { name: '添加 WiFi' }));

    await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(1));
    const savedWifiList = savedConfig().wifiList;
    const savedWifi = savedWifiList[savedWifiList.length - 1];
    expect(savedWifi).toMatchObject({
      ssid: 'TUST-LAB',
      requiresAuth: true,
      linkedAccountIds: [secondAccount.id],
      linkedAccountId: secondAccount.id,
      autoConnect: true,
      priority: 10,
    });
    expect(savedWifi?.id).toBeTruthy();
    expect((screen.getByLabelText('WiFi 名称') as HTMLInputElement).value).toBe('');
  });

  it('同名网络可以用明确安全类型和 BSSID 保存为独立规则', async () => {
    renderSettings();
    fireEvent.change(screen.getByLabelText('WiFi 名称'), { target: { value: 'TUST-WIFI' } });
    fireEvent.change(screen.getByLabelText('安全类型（留空自动识别）'), {
      target: { value: 'WPA3' },
    });
    fireEvent.change(screen.getByLabelText('BSSID（可选，限定接入点）'), {
      target: { value: 'aa:bb:cc:dd:ee:ff' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /需要校园网认证/ }));
    fireEvent.click(screen.getByRole('button', { name: '添加 WiFi' }));
    await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(1));
    expect(savedConfig().wifiList).toHaveLength(2);
    expect(savedConfig().wifiList[1]).toMatchObject({
      ssid: 'TUST-WIFI',
      security: 'WPA3',
      bssid: 'aa:bb:cc:dd:ee:ff',
    });
  });

  it('支持切换自动重连、删除 WiFi 与修改通用设置', async () => {
    renderSettings();

    fireEvent.click(
      screen.getByRole('button', { name: `禁用 ${makeConfig().wifiList[0].ssid} 自动重连` })
    );
    await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(1));
    expect(savedConfig().wifiList[0].autoConnect).toBe(false);

    fireEvent.click(screen.getByRole('checkbox', { name: /断线自动重连/ }));
    await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(2));
    expect(savedConfig(1).settings.autoReconnect).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '删除 WiFi TUST-WIFI' }));
    await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(3));
    expect(savedConfig(2).wifiList).toEqual([]);
  });

  it('保存失败时显示错误并保留表单内容', async () => {
    setConfig.mockRejectedValue(new Error('磁盘写入失败'));
    renderSettings();
    fireEvent.change(screen.getByLabelText('用户名'), {
      target: { value: '20250003' },
    });
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'new-secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存并添加账号' }));

    expect((await screen.findByRole('alert')).textContent).toContain('磁盘写入失败');
    expect((screen.getByLabelText('用户名') as HTMLInputElement).value).toBe('20250003');
    expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe('new-secret');
  });
});
