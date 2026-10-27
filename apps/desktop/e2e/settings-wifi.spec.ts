import { test, expect } from './fixtures';
import { openSettings } from './helpers';

test('设置页可添加、切换自动重连并删除 WiFi', async ({ appWindow: window }) => {
  await openSettings(window);

  await window.getByLabel('WiFi 名称').fill('TUST-Lab');
  await window.getByLabel('WiFi 密码').fill('lab-secret');
  await window.getByRole('button', { name: '选择账号 20250001' }).click();
  await window.getByLabel('WiFi 优先级').fill('3');
  await window.getByRole('button', { name: '添加 WiFi' }).click();

  const wifiRow = window.getByRole('listitem', { name: 'WiFi TUST-Lab' });
  await expect(wifiRow).toBeVisible();
  await expect(wifiRow).toContainText('需要认证');
  await expect(wifiRow).toContainText('优先级 3');
  await expect(wifiRow).toContainText('关联账号: 20250001');

  await wifiRow.getByRole('button', { name: '禁用 TUST-Lab 自动重连' }).click();
  await expect(wifiRow).toContainText('手动连接');

  await wifiRow.getByRole('button', { name: '删除 WiFi TUST-Lab' }).click();
  await expect(wifiRow).toHaveCount(0);
});

test('重复或空 WiFi 名称会显示校验错误', async ({ appWindow: window }) => {
  await openSettings(window);

  await window.getByRole('button', { name: '添加 WiFi' }).click();
  await expect(window.getByRole('alert')).toHaveText('请输入 WiFi 名称');

  await window.getByLabel('WiFi 名称').fill('TUST-WIFI');
  await window.getByRole('button', { name: '选择账号 20250001' }).click();
  await window.getByRole('button', { name: '添加 WiFi' }).click();
  await expect(window.getByRole('alert')).toHaveText('该 WiFi 配置已存在');
});

test('需要认证但未选择账号时不会添加 WiFi', async ({ appWindow: window }) => {
  await openSettings(window);

  await window.getByLabel('WiFi 名称').fill('TUST-NoAccount');
  await window.getByRole('button', { name: '添加 WiFi' }).click();

  await expect(window.getByRole('alert')).toHaveText('需要认证的 WiFi 必须选择关联账号');
  await expect(window.getByRole('listitem', { name: 'WiFi TUST-NoAccount' })).toHaveCount(0);
});
