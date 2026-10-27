import { test, expect } from './fixtures';
import { openPage } from './helpers';

test('侧边栏可在主要页面间导航并标记当前页', async ({ appWindow: window }) => {
  await openPage(window, '配置设置');
  await expect(window.getByRole('heading', { level: 1, name: '配置设置' })).toBeVisible();

  await openPage(window, '运行日志');
  await expect(window.getByRole('heading', { name: '运行日志' })).toBeVisible();

  await openPage(window, '关于');
  await expect(window.getByRole('heading', { level: 1, name: '关于' })).toBeVisible();

  await openPage(window, '运行状态');
  await expect(window.getByRole('heading', { level: 1, name: '运行状态' })).toBeVisible();
});
