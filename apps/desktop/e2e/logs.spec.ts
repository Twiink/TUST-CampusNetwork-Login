import { test, expect } from './fixtures';

test('日志页按级别筛选日志', async ({ appWindow: window }) => {
  await window.getByText('运行日志').click();

  // 初始展示全部级别
  await expect(window.getByText('心跳检测正常')).toBeVisible();
  await expect(window.getByText('登录成功')).toBeVisible();
  await expect(window.getByText('WiFi 信号较弱')).toBeVisible();

  // 切换到「警告」级别后仅剩 warn 条目
  await window.getByRole('button', { name: '警告' }).click();

  await expect(window.getByText('WiFi 信号较弱')).toBeVisible();
  await expect(window.getByText('心跳检测正常')).toHaveCount(0);
  await expect(window.getByText('登录成功')).toHaveCount(0);
});
