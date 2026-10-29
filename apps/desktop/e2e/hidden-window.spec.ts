import { test, expect } from './fixtures';

test.use({ scenario: 'hidden-window' });
test.setTimeout(60_000);

test('实际销毁隐藏窗口后切网继续认证，重建窗口收到新状态', async ({
  appWindow: page,
  electronApp,
}) => {
  await page.evaluate(() =>
    window.electronAPI.settings.update({ autoReconnect: true, enableHeartbeat: true })
  );
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  await expect
    .poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length))
    .toBe(0);
  await electronApp.evaluate(() => {
    const radio = (
      globalThis as unknown as {
        netmateHardware: { ssid: string; online: boolean; requests: string[] };
      }
    ).netmateHardware;
    radio.ssid = 'TUST-Backup';
    radio.online = false;
    radio.requests.length = 0;
  });
  await expect
    .poll(
      () =>
        electronApp.evaluate(
          () =>
            (globalThis as unknown as { netmateHardware: { requests: string[] } }).netmateHardware
              .requests.length
        ),
      { timeout: 45000 }
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      electronApp.evaluate(
        () =>
          (globalThis as unknown as { netmateHardware: { online: boolean } }).netmateHardware.online
      )
    )
    .toBe(true);
  const reopened = electronApp.waitForEvent('window');
  await electronApp.evaluate(({ app }) => {
    app.emit('activate');
  });
  const next = await reopened;
  await expect(next.getByText('TUST-Backup', { exact: true }).first()).toBeVisible();
  await expect(next.getByRole('button', { name: '断开连接' })).toBeVisible();
});
