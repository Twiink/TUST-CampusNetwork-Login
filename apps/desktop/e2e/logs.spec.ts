import { test, expect } from './fixtures';
import { openPage } from './helpers';

test('日志页按级别筛选日志', async ({ appWindow: window }) => {
  await openPage(window, '运行日志');

  await window.getByLabel('搜索全部历史日志').fill('完成');

  // 查询保留历史，再切换级别。
  await expect(window.getByText('核心服务初始化完成')).toBeVisible();
  await expect(window.getByText('配置加载完成')).toBeVisible();
  await expect(window.getByText('网络检测服务初始化完成')).toBeVisible();

  // 切换到「成功」级别后不再显示 info 条目。
  await window.getByRole('button', { name: '成功' }).click();

  await expect(window.getByText('网络检测服务初始化完成')).toHaveCount(0);
  await expect(window.getByText('核心服务初始化完成')).toHaveCount(0);
  await expect(window.getByText('配置加载完成')).toHaveCount(0);
});

test('清除日志后展示空态并禁用导出', async ({ appWindow: window }) => {
  await openPage(window, '运行日志');
  await expect(window.getByRole('region', { name: '日志列表' })).toBeVisible();
  // Coalesced status queries complete before clearing; pending log batches are discarded by clear.
  await window.evaluate(() => globalThis.window.electronAPI.network.getStatus());

  await window.getByRole('button', { name: '清除日志' }).click();

  await expect(window.getByText('暂无日志记录')).toBeVisible();
  await expect(window.getByRole('button', { name: '导出日志' })).toBeDisabled();
  await window.evaluate(() => globalThis.window.electronAPI.network.getStatus());
  await expect(window.getByText('网络状态检测完成').first()).toBeVisible();
  await expect(window.getByRole('button', { name: '导出日志' })).toBeEnabled();
});

test('日志目录和导出命令可正常执行', async ({ appWindow: window }) => {
  await openPage(window, '运行日志');

  await window.getByRole('button', { name: '日志目录' }).click();
  await window.getByRole('button', { name: '导出日志' }).click();
  await window.getByLabel('导出格式').selectOption('json');
  await window.getByRole('button', { name: '导出日志' }).click();

  await expect(window.getByRole('button', { name: '清除日志' })).toBeEnabled();
});
