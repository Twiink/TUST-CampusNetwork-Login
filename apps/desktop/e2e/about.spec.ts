import { readFileSync } from 'node:fs';
import { test, expect } from './fixtures';
import { openPage } from './helpers';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
) as { version: string };

test('关于页展示真实版本与仓库链接', async ({ appWindow: window }) => {
  await openPage(window, '关于');

  await expect(window.getByText(`版本 ${packageJson.version}`)).toBeVisible();
  await expect(window.getByRole('link', { name: 'GitHub 仓库' })).toHaveAttribute(
    'href',
    'https://github.com/Twiink/TUST-CampusNetwork-Login'
  );
  await expect(window.getByRole('link', { name: '问题反馈' })).toHaveAttribute(
    'href',
    'https://github.com/Twiink/TUST-CampusNetwork-Login/issues'
  );
  await window.getByRole('button', { name: '检查更新' }).click();
  await expect(window.getByText('已是最新版本')).toBeVisible();
});
