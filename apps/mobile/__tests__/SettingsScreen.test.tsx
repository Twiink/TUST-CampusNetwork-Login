import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createDefaultAppConfig, type AccountConfig, type AppConfig } from '@repo/shared';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { useApp, type ConfigUpdate } from '../src/context/AppContext';

jest.mock('../src/context/AppContext', () => ({
  useApp: jest.fn(),
}));

const mockUseApp = useApp as jest.Mock;

jest.mock('../src/context/ThemeContext', () => {
  const { getTheme } = jest.requireActual('../src/constants/theme');
  return {
    useTheme: () => ({ theme: getTheme('dark'), themeMode: 'dark' }),
  };
});

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

function makeConfig(accounts: AccountConfig[] = [firstAccount, secondAccount]): AppConfig {
  return {
    ...createDefaultAppConfig(),
    accounts,
    currentAccountId: accounts[0]?.id ?? null,
    wifiList: [],
  };
}

function renderSettings(config: AppConfig = makeConfig()) {
  const setConfig = jest.fn<void, [ConfigUpdate]>();
  mockUseApp.mockReturnValue({
    config,
    setConfig,
    permissionItems: [],
    requestAppPermission: jest.fn().mockResolvedValue(undefined),
    runPermissionGuide: jest.fn().mockResolvedValue(undefined),
  });
  return { ...render(<SettingsScreen />), setConfig };
}

function savedConfig(setConfig: jest.Mock, callIndex = 0, base = makeConfig()): AppConfig {
  const update = setConfig.mock.calls[callIndex]?.[0] as ConfigUpdate | undefined;
  if (!update) {
    throw new Error(`缺少第 ${callIndex + 1} 次配置更新`);
  }
  return typeof update === 'function' ? update(base) : update;
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockUseApp.mockReset();
  });

  it('账号表单拒绝空白、重复用户名和非法 URL', async () => {
    renderSettings();

    fireEvent.press(screen.getByLabelText('保存并添加账号'));
    expect(await screen.findByText('请输入用户名和密码')).toBeTruthy();

    fireEvent.changeText(
      screen.getByPlaceholderText('请输入学号/用户名'),
      `  ${firstAccount.username}  `
    );
    fireEvent.changeText(screen.getByPlaceholderText('请输入密码'), 'new-password');
    fireEvent.press(screen.getByLabelText('保存并添加账号'));
    expect(await screen.findByText('该用户名已存在')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('请输入学号/用户名'), '20250003');
    fireEvent.changeText(screen.getByPlaceholderText('http://...'), 'ftp://invalid');
    fireEvent.press(screen.getByLabelText('保存并添加账号'));
    expect(await screen.findByText('服务器地址格式无效，仅支持 http:// 或 https://')).toBeTruthy();
  });

  it('添加账号时去除首尾空白、生成 ID 并设为当前账号', () => {
    const config = makeConfig([]);
    const { setConfig } = renderSettings(config);

    fireEvent.changeText(screen.getByPlaceholderText('请输入学号/用户名'), '  20250003  ');
    fireEvent.changeText(screen.getByPlaceholderText('请输入密码'), 'new-password');
    fireEvent.press(screen.getByLabelText('保存并添加账号'));

    expect(setConfig).toHaveBeenCalledTimes(1);
    const saved = savedConfig(setConfig, 0, config);
    expect(saved.accounts).toHaveLength(1);
    expect(saved.accounts[0]).toMatchObject({
      name: '20250003',
      username: '20250003',
      password: 'new-password',
    });
    expect(saved.accounts[0].id).toBeTruthy();
    expect(saved.currentAccountId).toBe(saved.accounts[0].id);
    expect(screen.getByPlaceholderText('请输入学号/用户名').props.value).toBe('');
  });

  it('删除账号时清理两种关联字段并切换当前账号', () => {
    const config = makeConfig();
    config.wifiList = [
      {
        id: 'w1',
        ssid: 'TUST-WIFI',
        password: 'wifi-password',
        autoConnect: true,
        requiresAuth: true,
        linkedAccountIds: [firstAccount.id, secondAccount.id],
        linkedAccountId: firstAccount.id,
        priority: 10,
        lastConnectedAt: null,
      },
    ];
    const { setConfig } = renderSettings(config);

    fireEvent.press(screen.getByLabelText(`删除账号 ${firstAccount.username}`));

    const saved = savedConfig(setConfig, 0, config);
    expect(saved.accounts).toEqual([secondAccount]);
    expect(saved.currentAccountId).toBe(secondAccount.id);
    expect(saved.wifiList[0]).toMatchObject({
      linkedAccountIds: [secondAccount.id],
      linkedAccountId: secondAccount.id,
    });
  });

  it('支持切换当前账号', () => {
    const { setConfig } = renderSettings();

    fireEvent.press(screen.getByLabelText(`使用账号 ${secondAccount.username}`));
    expect(savedConfig(setConfig).currentAccountId).toBe(secondAccount.id);
  });

  it('WiFi 表单拒绝重复 SSID、空 SSID 和未关联账号', async () => {
    const config = makeConfig();
    config.wifiList = [
      {
        id: 'w1',
        ssid: 'TUST-WIFI',
        password: '',
        autoConnect: true,
        requiresAuth: true,
        linkedAccountIds: [firstAccount.id],
        linkedAccountId: firstAccount.id,
        priority: 10,
        lastConnectedAt: null,
      },
    ];
    const firstRender = renderSettings(config);

    fireEvent.changeText(screen.getByPlaceholderText('请输入 WiFi 名称'), 'TUST-WIFI');
    fireEvent.press(screen.getByLabelText(`选择账号 ${firstAccount.username}`));
    fireEvent.press(screen.getByLabelText('添加 WiFi'));
    expect(await screen.findByText('该 WiFi 配置已存在')).toBeTruthy();
    expect(firstRender.setConfig).not.toHaveBeenCalled();
    firstRender.unmount();

    const emptyConfig = makeConfig();
    const secondRender = renderSettings(emptyConfig);
    fireEvent.changeText(screen.getByPlaceholderText('请输入 WiFi 名称'), 'TUST-LAB');
    expect(screen.getByLabelText('添加 WiFi').props.accessibilityState?.disabled).toBe(true);
    expect(secondRender.setConfig).not.toHaveBeenCalled();
  });

  it('添加认证 WiFi 时写入两种关联字段并清空表单', () => {
    const config = makeConfig();
    config.wifiList = [];
    const { setConfig } = renderSettings(config);

    fireEvent.changeText(screen.getByPlaceholderText('请输入 WiFi 名称'), '  TUST-LAB  ');
    fireEvent.press(screen.getByLabelText(`选择账号 ${secondAccount.username}`));
    fireEvent.press(screen.getByLabelText('添加 WiFi'));

    const saved = savedConfig(setConfig, 0, config);
    expect(saved.wifiList).toHaveLength(1);
    expect(saved.wifiList[0]).toMatchObject({
      ssid: 'TUST-LAB',
      requiresAuth: true,
      linkedAccountIds: [secondAccount.id],
      linkedAccountId: secondAccount.id,
      autoConnect: true,
      priority: 10,
    });
    expect(screen.getByPlaceholderText('请输入 WiFi 名称').props.value).toBe('');
  });

  it('无需认证的 WiFi 添加时不保留关联账号', () => {
    const config = makeConfig();
    config.wifiList = [];
    const { setConfig } = renderSettings(config);

    fireEvent.changeText(screen.getByPlaceholderText('请输入 WiFi 名称'), 'Home-WiFi');
    fireEvent(screen.getByLabelText('需要校园网认证'), 'valueChange', false);
    fireEvent.press(screen.getByLabelText('添加 WiFi'));

    const saved = savedConfig(setConfig, 0, config);
    expect(saved.wifiList[0]).toMatchObject({
      ssid: 'Home-WiFi',
      requiresAuth: false,
      linkedAccountIds: [],
    });
    expect(saved.wifiList[0].linkedAccountId).toBeUndefined();
  });

  it('删除 WiFi 配置后保留其他配置', () => {
    const config = makeConfig();
    config.wifiList = [
      {
        id: 'w1',
        ssid: 'TUST-WIFI',
        password: '',
        autoConnect: true,
        requiresAuth: false,
        linkedAccountIds: [],
        priority: 10,
        lastConnectedAt: null,
      },
    ];
    const { setConfig } = renderSettings(config);

    fireEvent.press(screen.getByLabelText('删除 WiFi TUST-WIFI'));
    expect(savedConfig(setConfig, 0, config).wifiList).toEqual([]);
  });
});
