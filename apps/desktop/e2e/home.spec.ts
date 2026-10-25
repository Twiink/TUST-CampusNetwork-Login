import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { createElectronLaunchOptions } from './launchOptions';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

test('主页展示已连接 WiFi 的状态卡片', async () => {
  const electronApp = await electron.launch(createElectronLaunchOptions(currentDir));

  try {
    const window = await electronApp.firstWindow();

    await expect(window.getByText('TUST-WIFI').first()).toBeVisible();
    await expect(window.getByText('网络延迟')).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test('WiFi 断开时主页展示未连接提示', async () => {
  const electronApp = await electron.launch(
    createElectronLaunchOptions(currentDir, process.platform, {
      ...process.env,
      E2E_NETWORK_STATE: 'offline',
    })
  );

  try {
    const window = await electronApp.firstWindow();

    await expect(window.getByRole('heading', { name: '未连接 WiFi' })).toBeVisible();
    await expect(window.getByText(/当前设备未连接到任何 WiFi 网络/)).toBeVisible();
  } finally {
    await electronApp.close();
  }
});
