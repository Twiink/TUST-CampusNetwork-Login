import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { test, expect } from './fixtures';
import { createElectronLaunchOptions } from './launchOptions';
import { openSettings, openPage } from './helpers';

test('编辑保留 ID、关联和密码；暂停与配置跨真实主进程重启保存', async ({ scenario }, info) => {
  const directory = info.outputPath('restart-data');
  await mkdir(directory, { recursive: true });
  const options = createElectronLaunchOptions(
    path.dirname(fileURLToPath(import.meta.url)),
    process.platform,
    { ...process.env, E2E_SCENARIO: scenario, NETMATE_E2E_USER_DATA_DIR: directory }
  );
  let app = await electron.launch(options);
  try {
    let page = await app.firstWindow();
    await expect(page.getByRole('button', { name: '断开连接' })).toBeVisible();
    await page.getByRole('button', { name: '断开连接' }).click();
    await expect(page.getByText('自动认证已暂停')).toBeVisible();
    await openSettings(page);
    await page.getByRole('button', { name: '编辑账号 20250001' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('用户名', { exact: true }).fill('20250009');
    await dialog.getByRole('button', { name: '保存修改' }).click();
    await expect(dialog).toHaveCount(0);
    const before = await page.evaluate(() => window.electronAPI.config.get());
    if (!before) throw new Error('Configuration missing');
    await app.close();
    app = await electron.launch(options);
    page = await app.firstWindow();
    await expect(page.getByText('自动认证已暂停')).toBeVisible();
    const after = await page.evaluate(() => window.electronAPI.config.get());
    if (!after) throw new Error('Configuration missing after restart');
    expect(after.accounts[0]).toMatchObject({
      id: before.accounts[0].id,
      password: 'e2e-pass',
      username: '20250009',
    });
    expect(after.wifiList[0].linkedAccountIds).toEqual(before.wifiList[0].linkedAccountIds);
    await page.getByRole('button', { name: '恢复自动认证' }).click();
    await expect(page.getByText('自动认证已暂停')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('附近扫描、选择、编辑与实际无线边界连接', async ({ appWindow: page }) => {
  await openSettings(page);
  await page.getByRole('button', { name: '扫描附近 WiFi' }).click();
  await page.getByRole('button', { name: '选择网络 Nearby-WIFI' }).click();
  await expect(page.getByLabel('WiFi 名称')).toHaveValue('Nearby-WIFI');
  await page.getByRole('button', { name: '选择账号 20250001' }).click();
  await page.getByRole('button', { name: '添加 WiFi' }).click();
  await expect(page.getByRole('listitem', { name: 'WiFi Nearby-WIFI' })).toBeVisible();
  await openPage(page, '运行状态');
  expect(await page.evaluate(() => window.electronAPI.wifi.switch('Nearby-WIFI'))).toBe(true);
});

test('多账号异常回退通过真实门户、IPC 和认证服务', async ({ appWindow: page, electronApp }) => {
  await page.getByRole('button', { name: '断开连接' }).click();
  await openSettings(page);
  const config = await page.evaluate(() => window.electronAPI.config.get());
  if (!config) throw new Error('Configuration missing');
  await page.getByLabel('用户名', { exact: true }).fill('reject');
  await page.getByLabel('密码', { exact: true }).fill('fake-password');
  await page.getByLabel('服务器地址').fill(config.accounts[0].serverUrl);
  await page.getByRole('button', { name: '保存并添加账号' }).click();
  await page.getByRole('button', { name: '编辑 WiFi TUST-WIFI' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('checkbox', { name: 'reject', exact: true }).check();
  await dialog.getByRole('button', { name: '上移账号 2' }).click();
  await dialog.getByRole('button', { name: '保存修改' }).click();
  await openPage(page, '运行状态');
  await page.getByRole('button', { name: '立即连接' }).click();
  await expect(page.getByRole('button', { name: '断开连接' })).toBeVisible();
  const requests = await electronApp.evaluate(
    () =>
      (globalThis as unknown as { netmateHardware: { requests: string[] } }).netmateHardware
        .requests
  );
  expect(requests.slice(-2)).toEqual([',0,reject', ',0,20250001']);
  const logs = await page.evaluate(() => window.electronAPI.log.export('text'));
  expect(logs).not.toContain('fake-password');
  expect(logs).not.toContain('e2e-pass');
});

test('重连全部失败后自动恢复，冷却为零仍继续下一轮', async ({ appWindow: page, electronApp }) => {
  test.setTimeout(90_000);
  await page.evaluate(() =>
    window.electronAPI.settings.update({
      autoReconnect: true,
      wifiReconnectRetries: 1,
      wifiReconnectCooldownMinutes: 0,
    })
  );
  // Establish the initial SSID observation before dropping the controlled hardware connection.
  await expect
    .poll(async () =>
      (await page.evaluate(() => window.electronAPI.log.export('text'))).includes('WiFi')
    )
    .toBe(true);
  await electronApp.evaluate(() => {
    const hardware = (
      globalThis as unknown as {
        netmateHardware: { ssid: string | null; failConnections: boolean; online: boolean };
      }
    ).netmateHardware;
    hardware.failConnections = true;
    hardware.online = false;
    hardware.ssid = null;
  });
  await expect(page.getByText(/所有.*失败|全部.*失败/).first()).toBeVisible({ timeout: 45000 });
  await electronApp.evaluate(() => {
    (
      globalThis as unknown as { netmateHardware: { failConnections: boolean } }
    ).netmateHardware.failConnections = false;
  });
  await expect(page.getByRole('button', { name: '断开连接' })).toBeVisible({ timeout: 45000 });
});
