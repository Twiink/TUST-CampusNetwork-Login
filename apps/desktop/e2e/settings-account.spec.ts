import { test, expect } from './fixtures';

test('设置页添加账户后列表展示新账户', async ({ appWindow: window }) => {
  await window.getByText('配置设置', { exact: true }).click();

  const usernameInput = window.getByPlaceholder('请输入学号/用户名');
  await expect(usernameInput).toBeVisible();
  await usernameInput.fill('20250999');
  await window.getByPlaceholder('请输入密码').fill('e2e-secret');
  await window.getByText('保存并添加账号').click();

  await expect(window.getByText('20250999').first()).toBeVisible();
  // 新账户成为当前账户，列表按钮显示「使用中」
  await expect(window.getByText('使用中').first()).toBeVisible();
});
