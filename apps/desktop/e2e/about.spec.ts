import { test, expect } from './fixtures';

test('关于页展示真实版本与仓库链接', async ({ appWindow: window }) => {
  await window.getByText('关于').click();

  await expect(window.getByText('版本 1.0.0')).toBeVisible();
  await expect(window.getByRole('link', { name: 'GitHub 仓库' })).toHaveAttribute(
    'href',
    'https://github.com/Twiink/TUST-CampusNetwork-Login'
  );
});
