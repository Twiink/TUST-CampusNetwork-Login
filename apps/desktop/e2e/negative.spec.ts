import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { createElectronLaunchOptions } from './launchOptions';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

test('空表单提交不会新增账户', async () => {
  const electronApp = await electron.launch(createElectronLaunchOptions(currentDir));

  try {
    const window = await electronApp.firstWindow();

    await window.getByText('配置设置').click();

    // 初始只有一个账户（桩里的 20250001，列表与关联选择区共出现两处）
    await expect(window.getByText('20250001').first()).toBeVisible();

    // 用户名/密码留空直接点击保存
    await window.getByText('保存并添加账号').click();

    // 列表不新增：不出现空账户项，「使用中」仍只有一个
    await window.waitForTimeout(800);
    await expect(window.getByText('20250999')).toHaveCount(0);
    expect(await window.getByText('使用中').count()).toBe(1);
  } finally {
    await electronApp.close();
  }
});

test('日志筛选无匹配级别时显示空态提示', async () => {
  const electronApp = await electron.launch(createElectronLaunchOptions(currentDir));

  try {
    const window = await electronApp.firstWindow();

    await window.getByText('运行日志').click();

    // 桩数据中没有 debug 级别日志
    await window.getByRole('button', { name: '调试' }).click();

    await expect(window.getByText('暂无 调试 级别的日志')).toBeVisible();
    await expect(window.getByText('心跳检测正常')).toHaveCount(0);
  } finally {
    await electronApp.close();
  }
});
