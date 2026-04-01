import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

test('关于页展示真实版本与仓库链接', async () => {
  const electronApp = await electron.launch({
    args: [path.join(currentDir, '..', 'dist-electron', 'main.js')],
  });

  try {
    const window = await electronApp.firstWindow();
    await window.getByText('关于').click();

    await expect(window.getByText('版本 1.0.0')).toBeVisible();
    await expect(window.getByRole('link', { name: 'GitHub 仓库' })).toHaveAttribute(
      'href',
      'https://github.com/Twiink/TUST-Campusnet-Login'
    );
  } finally {
    await electronApp.close();
  }
});
