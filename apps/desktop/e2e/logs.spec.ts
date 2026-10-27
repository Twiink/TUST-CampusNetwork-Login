import { test, expect } from './fixtures';
import { openPage } from './helpers';

test('日志页按级别筛选日志', async ({ appWindow: window }) => {
  await openPage(window, '运行日志');

  // 初始展示全部级别
  await expect(window.getByText('核心服务初始化完成')).toBeVisible();
  await expect(window.getByText('配置加载完成')).toBeVisible();
  await expect(window.getByText('网络检测服务初始化完成')).toBeVisible();

  // 切换到「警告」级别后仅剩 warn 条目
  await window.getByRole('button', { name: '成功' }).click();

  await expect(window.getByText('网络检测服务初始化完成')).toHaveCount(0);
  await expect(window.getByText('核心服务初始化完成')).toHaveCount(0);
  await expect(window.getByText('配置加载完成')).toHaveCount(0);
});

test('清除日志后展示空态并禁用导出', async ({ appWindow: window }) => {
  await openPage(window, '运行日志');
  await expect(window.getByText('核心服务初始化完成')).toBeVisible();
  // The first renderer network query can finish after navigation. Wait for its
  // real completion before clearing; later diagnostic entries enable exports.
  await expect(window.getByText('网络状态获取成功')).toBeVisible();

  await window.getByRole('button', { name: '清除日志' }).click();

  await expect(window.getByText('暂无日志记录')).toBeVisible();
  await expect(window.getByRole('button', { name: '导出 LOG' })).toBeDisabled();
  await expect(window.getByRole('button', { name: '导出 JSON' })).toBeDisabled();
});

test('日志目录和导出命令可正常执行', async ({ appWindow: window }) => {
  await openPage(window, '运行日志');

  await window.getByRole('button', { name: '日志目录' }).click();
  await window.getByRole('button', { name: '导出 LOG' }).click();
  await window.getByRole('button', { name: '导出 JSON' }).click();

  await expect(window.getByRole('button', { name: '清除日志' })).toBeEnabled();
});
