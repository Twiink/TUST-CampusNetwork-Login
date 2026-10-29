import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { createElectronLaunchOptions } from './launchOptions';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

type ElectronFixtures = {
  networkState: 'online' | 'offline';
  scenario:
    | 'authenticated'
    | 'offline'
    | 'unconfigured'
    | 'auth-required'
    | 'unlinked'
    | 'no-auth'
    | 'settings-empty'
    | 'multiple-wifi'
    | 'hidden-window';
  electronApp: ElectronApplication;
  appWindow: Page;
};

export const test = base.extend<ElectronFixtures>({
  networkState: ['online', { option: true }],
  scenario: ['authenticated', { option: true }],
  electronApp: async ({ networkState, scenario }, provide, testInfo) => {
    const userDataDir = testInfo.outputPath('user-data');
    await mkdir(userDataDir, { recursive: true });
    const electronApp = await test.step('Launch Electron', () =>
      electron.launch(
        createElectronLaunchOptions(currentDir, process.platform, {
          ...process.env,
          E2E_NETWORK_STATE: networkState,
          E2E_SCENARIO: scenario,
          NETMATE_E2E_USER_DATA_DIR: userDataDir,
        })
      ));

    const processOutput: string[] = [];
    electronApp.process().stdout?.on('data', (chunk) => processOutput.push(String(chunk)));
    electronApp.process().stderr?.on('data', (chunk) => processOutput.push(String(chunk)));
    try {
      // Electron contexts are created outside Playwright's built-in page fixture.
      await electronApp
        .context()
        .tracing.start({ screenshots: true, snapshots: true, sources: true });
      try {
        await provide(electronApp);
      } finally {
        const failed = testInfo.status !== testInfo.expectedStatus;
        const tracePath = testInfo.outputPath('trace.zip');
        await electronApp.context().tracing.stop(failed ? { path: tracePath } : {});
        if (failed) {
          await testInfo.attach('trace', { path: tracePath, contentType: 'application/zip' });
        }
      }
    } finally {
      if (testInfo.status !== testInfo.expectedStatus)
        await testInfo.attach('main-process', {
          body: processOutput.join(''),
          contentType: 'text/plain',
        });
      await test.step('Close Electron', () => electronApp.close().catch(() => undefined));
    }
  },
  appWindow: async ({ electronApp }, provide, testInfo) => {
    const page = await test.step('Open main window', () => electronApp.firstWindow());
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => Boolean(window.electronAPI));
    await expect
      .poll(() =>
        electronApp.evaluate(
          () => (globalThis as unknown as { netmateReady?: boolean }).netmateReady
        )
      )
      .toBe(true);

    try {
      await provide(page);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo
          .attach('screenshot', {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
          })
          .catch(() => undefined);
      }
      if (pageErrors.length > 0) {
        await testInfo.attach('page-errors', {
          body: pageErrors.join('\n\n'),
          contentType: 'text/plain',
        });
      }
      if (consoleErrors.length > 0) {
        await testInfo.attach('console-errors', {
          body: consoleErrors.join('\n\n'),
          contentType: 'text/plain',
        });
      }
    }

    if (pageErrors.length > 0 && testInfo.status === testInfo.expectedStatus) {
      throw new Error(`渲染进程未捕获异常:\n${pageErrors.join('\n')}`);
    }
  },
});

export { expect };
