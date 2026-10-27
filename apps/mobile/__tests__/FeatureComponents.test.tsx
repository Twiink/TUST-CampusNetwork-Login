import React from 'react';
import { Keyboard } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createDefaultAppConfig, type AppConfig } from '@repo/shared';
import { ConfigEditor } from '../src/components/settings/ConfigEditor';
import { NearbyWifi } from '../src/components/settings/NearbyWifi';
import { UpdateCard } from '../src/components/settings/UpdateCard';
import { scanWifiNetworks } from '../src/native/WifiModule';
import * as Updates from '../src/native/AppUpdater';
jest.mock('../src/context/ThemeContext', () => ({
  useTheme: () => ({ theme: jest.requireActual('../src/constants/theme').getTheme('dark') }),
}));
jest.mock('../src/native/WifiModule', () => ({ scanWifiNetworks: jest.fn() }));
jest.mock('../src/native/AppUpdater', () => ({
  getCurrentVersion: () => '1.0.1',
  checkForUpdate: jest.fn(),
  getDownloadStatus: jest.fn(),
  startUpdateDownload: jest.fn(),
  cancelUpdateDownload: jest.fn(),
  installDownloadedUpdate: jest.fn(),
}));
const account = {
  id: 'a1',
  name: 'One',
  username: 'fake-user',
  password: 'secret',
  serverUrl: 'http://portal.test',
  isp: 'campus' as const,
};
const config = () =>
  createDefaultAppConfig({
    accounts: [account],
    currentAccountId: 'a1',
    wifiList: [
      {
        id: 'w1',
        ssid: 'TUST',
        password: 'wifi-secret',
        autoConnect: true,
        requiresAuth: true,
        linkedAccountIds: ['a1'],
        priority: 1,
        lastConnectedAt: null,
      },
    ],
  });
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(Keyboard, 'addListener')
    .mockImplementation(
      () => ({ remove: jest.fn() }) as unknown as ReturnType<typeof Keyboard.addListener>
    );
  (Updates.getDownloadStatus as jest.Mock).mockResolvedValue({
    state: 'idle',
    progress: 0,
    version: null,
    installAllowed: false,
  });
});
test('账号编辑等待保存成功，空密码保留且关联不丢失', async () => {
  let saved: AppConfig | undefined;
  const close = jest.fn();
  render(
    <ConfigEditor
      config={config()}
      target={{ kind: 'account', id: 'a1' }}
      onClose={close}
      onSave={async update => {
        saved = update(config());
      }}
    />
  );
  fireEvent.changeText(screen.getByLabelText('编辑用户名'), 'edited');
  fireEvent.press(screen.getByText('保存修改'));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(saved?.accounts[0]).toMatchObject({ id: 'a1', username: 'edited', password: 'secret' });
  expect(saved?.wifiList[0].linkedAccountIds).toEqual(['a1']);
});
test('WiFi 保存失败显示错误并保留弹窗，重试可明确清除密码', async () => {
  const close = jest.fn();
  let saved: AppConfig | undefined;
  const save = jest
    .fn()
    .mockRejectedValueOnce(new Error('disk full'))
    .mockImplementation(async update => {
      saved = update(config());
    });
  render(
    <ConfigEditor
      config={config()}
      target={{ kind: 'wifi', id: 'w1' }}
      onClose={close}
      onSave={save}
    />
  );
  fireEvent(screen.getByLabelText('清除 WiFi 密码'), 'valueChange', true);
  fireEvent.press(screen.getByText('保存修改'));
  expect(await screen.findByText('disk full')).toBeTruthy();
  expect(close).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('保存修改'));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(saved?.wifiList[0]).toMatchObject({ id: 'w1', password: '', linkedAccountIds: ['a1'] });
});
test('扫描权限错误可重试，已保存网络进入编辑', async () => {
  (scanWifiNetworks as jest.Mock)
    .mockRejectedValueOnce(new Error('定位权限被拒绝'))
    .mockResolvedValueOnce([{ ssid: 'TUST', signalStrength: 80, security: 'WPA2' }]);
  const edit = jest.fn();
  render(<NearbyWifi config={config()} onSelect={jest.fn()} onEdit={edit} />);
  fireEvent.press(screen.getByText('扫描附近 WiFi'));
  expect(await screen.findByText('定位权限被拒绝')).toBeTruthy();
  fireEvent.press(screen.getByText('扫描附近 WiFi'));
  fireEvent.press(await screen.findByLabelText('编辑网络 TUST'));
  expect(edit).toHaveBeenCalledWith('w1');
});
test('更新下载失败和取消均可重试，安装授权有明确入口', async () => {
  (Updates.checkForUpdate as jest.Mock).mockResolvedValue({ version: '1.0.2' });
  (Updates.startUpdateDownload as jest.Mock)
    .mockRejectedValueOnce(new Error('下载失败'))
    .mockResolvedValueOnce({ state: 'downloading', progress: 20, version: '1.0.2' });
  (Updates.cancelUpdateDownload as jest.Mock).mockResolvedValue({ state: 'idle', progress: 0 });
  render(<UpdateCard />);
  fireEvent.press(screen.getByText('检查更新'));
  fireEvent.press(await screen.findByText('下载更新'));
  expect(await screen.findByText('下载失败')).toBeTruthy();
  fireEvent.press(screen.getByText('下载更新'));
  fireEvent.press(await screen.findByText('取消下载'));
  await waitFor(() => expect(Updates.cancelUpdateDownload).toHaveBeenCalled());
});
