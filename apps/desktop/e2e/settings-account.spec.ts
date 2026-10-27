import { test, expect } from './fixtures';
import { openSettings } from './helpers';

test('设置页添加账户后列表展示新账户', async ({ appWindow: window }) => {
  await openSettings(window);

  const usernameInput = window.getByLabel('用户名');
  await expect(usernameInput).toBeVisible();
  await usernameInput.fill('20250999');
  await window.getByLabel('密码', { exact: true }).fill('e2e-secret');
  await window.getByRole('button', { name: '中国移动' }).click();
  await window.getByRole('button', { name: '保存并添加账号' }).click();

  const newAccount = window.getByRole('listitem', { name: '账号 20250999' });
  await expect(newAccount).toBeVisible();
  await expect(newAccount.getByText('中国移动')).toBeVisible();
  await newAccount.getByRole('button', { name: '使用此账号' }).click();
  await expect(newAccount.getByRole('button', { name: '使用中' })).toBeDisabled();
});

test('重复用户名不会创建第二份账户', async ({ appWindow: window }) => {
  await openSettings(window);

  await window.getByLabel('用户名').fill('20250001');
  await window.getByLabel('密码', { exact: true }).fill('another-secret');
  await window.getByRole('button', { name: '保存并添加账号' }).click();

  await expect(window.getByRole('alert')).toHaveText('该用户名已存在');
  await expect(window.getByRole('listitem', { name: /^账号 / })).toHaveCount(1);
});

test('删除被 WiFi 引用的账户会解除关联并保持删除状态', async ({ appWindow: window }) => {
  await openSettings(window);
  await expect(window.getByRole('listitem', { name: 'WiFi TUST-WIFI' })).toContainText(
    '关联账号: 20250001'
  );

  await window.getByRole('button', { name: '删除账号 20250001' }).click();

  await expect(window.getByRole('listitem', { name: /^账号 / })).toHaveCount(0);
  await expect(window.getByText('暂无账号，请添加账号以使用登录功能')).toBeVisible();
  await expect(window.getByText('未关联账号（账号可能已删除）')).toBeVisible();

  await window.getByRole('button', { name: '运行状态' }).click();
  await window.getByRole('button', { name: '配置设置' }).click();

  await expect(window.getByRole('listitem', { name: /^账号 / })).toHaveCount(0);
  await expect(window.getByText('未关联账号（账号可能已删除）')).toBeVisible();
});
