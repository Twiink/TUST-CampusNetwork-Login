import { expect, type Page } from '@playwright/test';

export async function openPage(page: Page, name: '运行状态' | '配置设置' | '运行日志' | '关于') {
  const button = page.getByRole('button', { name });
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'page');
}

export async function openSettings(page: Page) {
  await openPage(page, '配置设置');
  await expect(page.getByRole('heading', { level: 1, name: '配置设置' })).toBeVisible();
}
