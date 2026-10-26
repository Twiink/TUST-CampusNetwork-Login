import { test, expect } from './fixtures';

test('主页展示已连接 WiFi 的状态卡片', async ({ appWindow: window }) => {
  await expect(window.getByText('TUST-WIFI').first()).toBeVisible();
  await expect(window.getByText('网络延迟')).toBeVisible();
});

test.describe('WiFi 离线', () => {
  test.use({ networkState: 'offline' });
  test('WiFi 断开时主页展示未连接提示', async ({ appWindow: window }) => {
    await expect(window.getByRole('heading', { name: '未连接 WiFi' })).toBeVisible();
    await expect(window.getByText(/当前设备未连接到任何 WiFi 网络/)).toBeVisible();
  });
});
