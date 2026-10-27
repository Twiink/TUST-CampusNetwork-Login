import { test, expect } from './fixtures';
import { openPage, openSettings } from './helpers';

test('心跳开关会控制间隔设置并保留修改值', async ({ appWindow: window }) => {
  await openSettings(window);

  const heartbeatToggle = window.getByRole('checkbox', { name: /启用心跳检测/ });
  await expect(heartbeatToggle).toBeChecked();
  await expect(window.getByLabel('心跳检测间隔 (秒)')).toBeVisible();

  await heartbeatToggle.click();
  await expect(heartbeatToggle).not.toBeChecked();
  await expect(window.getByLabel('心跳检测间隔 (秒)')).toHaveCount(0);

  await heartbeatToggle.click();
  const retryInput = window.getByLabel('单个 WiFi 重试次数');
  await retryInput.fill('5');
  await expect(retryInput).toHaveValue('5');

  await openPage(window, '运行状态');
  await openSettings(window);
  await expect(window.getByRole('checkbox', { name: /启用心跳检测/ })).toBeChecked();
  await expect(window.getByLabel('单个 WiFi 重试次数')).toHaveValue('5');
});

test('通知分项开关保存后在页面切换后保持', async ({ appWindow: window }) => {
  await openSettings(window);

  const notification = window.getByRole('checkbox', { name: 'WiFi 断开', exact: true });
  await expect(notification).toBeChecked();
  await notification.click();
  await expect(notification).not.toBeChecked();

  await openPage(window, '运行状态');
  await openSettings(window);
  await expect(window.getByRole('checkbox', { name: 'WiFi 断开', exact: true })).not.toBeChecked();
});
