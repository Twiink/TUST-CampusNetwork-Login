import { test, expect } from './fixtures';

test('主页展示已连接 WiFi 的状态卡片', async ({ appWindow: window }) => {
  await expect(window.getByText('TUST-WIFI').first()).toBeVisible();
  await expect(window.getByText('网络延迟')).toBeVisible();
  await expect(window.getByRole('button', { name: '断开连接' })).toBeVisible();
});

test.describe('WiFi 离线', () => {
  test.use({ scenario: 'offline' });
  test('WiFi 断开时主页展示未连接提示', async ({ appWindow: window }) => {
    await expect(window.getByRole('heading', { name: '未连接 WiFi' })).toBeVisible();
    await expect(window.getByText(/当前设备未连接到任何 WiFi 网络/)).toBeVisible();
    await expect(window.getByRole('button', { name: '立即连接' })).toHaveCount(0);
  });
});

test.describe('需要认证', () => {
  test.use({ scenario: 'auth-required' });

  test('可在主页完成登录和断开连接', async ({ appWindow: window }) => {
    const loginButton = window.getByRole('button', { name: '立即连接' });
    await expect(loginButton).toBeVisible();
    await loginButton.click();

    const logoutButton = window.getByRole('button', { name: '断开连接' });
    await expect(logoutButton).toBeVisible();
    await logoutButton.click();

    await expect(window.getByRole('button', { name: '立即连接' })).toBeVisible();
  });
});

test.describe('未配置 WiFi', () => {
  test.use({ scenario: 'unconfigured' });

  test('提示用户前往设置添加当前 WiFi', async ({ appWindow: window }) => {
    await expect(window.getByRole('heading', { name: '该 WiFi 未配置' })).toBeVisible();
    await expect(window.getByText('TUST-WIFI', { exact: true })).toBeVisible();
    await expect(window.getByText(/配置设置/).last()).toBeVisible();
  });
});

test.describe('无需认证', () => {
  test.use({ scenario: 'no-auth' });

  test('家庭网络展示无需认证且不提供无意义的注销按钮', async ({ appWindow: window }) => {
    await expect(window.getByRole('heading', { name: '无需认证' })).toBeVisible();
    await expect(window.getByRole('button', { name: '断开连接' })).toHaveCount(0);
  });
});

test.describe('认证账户缺失', () => {
  test.use({ scenario: 'unlinked' });

  test('提示为需要认证的 WiFi 关联账户', async ({ appWindow: window }) => {
    await expect(window.getByRole('heading', { name: '未配置账户' })).toBeVisible();
    await expect(window.getByText(/尚未关联账户/)).toBeVisible();
  });
});
