import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { createElectronLaunchOptions } from './launchOptions';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

type ElectronFixtures = {
  networkState: 'online' | 'offline';
  electronApp: ElectronApplication;
  appWindow: Page;
};

export const test = base.extend<ElectronFixtures>({
  networkState: ['online', { option: true }],
  electronApp: async ({ networkState }, provide, testInfo) => {
    const userDataDir = testInfo.outputPath('user-data');
    await mkdir(userDataDir, { recursive: true });
    const electronApp = await test.step('Launch Electron', () =>
      electron.launch(
        createElectronLaunchOptions(currentDir, process.platform, {
          ...process.env,
          E2E_NETWORK_STATE: networkState,
          NETMATE_E2E_USER_DATA_DIR: userDataDir,
        })
      ));

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
      await test.step('Close Electron', () => electronApp.close());
      await rm(userDataDir, { recursive: true, force: true });
    }
  },
  appWindow: async ({ electronApp }, provide) => {
    const window = await test.step('Open main window', () => electronApp.firstWindow());
    await provide(window);
  },
});

export { expect };
