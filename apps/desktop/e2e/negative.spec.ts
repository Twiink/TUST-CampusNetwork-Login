import { test, expect } from './fixtures';
import { openPage } from './helpers';

test('空表单提交不会新增账户', async ({ appWindow: window }) => {
  await openPage(window, '配置设置');

  const accountRows = window.getByRole('listitem', { name: /^账号 / });
  await expect(accountRows).toHaveCount(1);

  // 用户名/密码留空直接点击保存
  await window.getByRole('button', { name: '保存并添加账号' }).click();

  await expect(window.getByRole('alert')).toHaveText('请输入用户名和密码');
  await expect(window.getByText('20250999')).toHaveCount(0);
  await expect(accountRows).toHaveCount(1);
});

test('日志筛选无匹配级别时显示空态提示', async ({ appWindow: window }) => {
  await openPage(window, '运行日志');

  // 桩数据中没有 debug 级别日志
  await window.getByRole('button', { name: '调试' }).click();

  await expect(window.getByText('暂无 调试 级别的日志')).toBeVisible();
  await expect(window.getByText('心跳检测正常')).toHaveCount(0);
});
