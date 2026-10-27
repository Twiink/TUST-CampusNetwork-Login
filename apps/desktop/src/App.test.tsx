import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultAppConfig } from '@repo/shared';
import App from './App';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(window.electronAPI.config.get).mockResolvedValue(createDefaultAppConfig());
    vi.mocked(window.electronAPI.network.getWifiSSID).mockResolvedValue({
      connected: false,
      ssid: null,
    });
    vi.mocked(window.electronAPI.log.get).mockResolvedValue([]);
    vi.mocked(window.electronAPI.app.getVersion).mockResolvedValue('1.0.0');
    vi.mocked(window.electronAPI.update.getStatus).mockResolvedValue({
      checking: false,
      available: false,
      downloading: false,
      downloaded: false,
      progress: 0,
      version: null,
      error: null,
    });
  });

  it('侧栏在四个页面间导航并标记当前页', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText('未连接 WiFi')).toBeTruthy());
    expect(screen.getByRole('button', { name: /运行状态/ }).getAttribute('aria-current')).toBe(
      'page'
    );

    fireEvent.click(screen.getByRole('button', { name: /配置设置/ }));
    expect(await screen.findByText('通用设置')).toBeTruthy();
    expect(screen.getByRole('button', { name: /配置设置/ }).getAttribute('aria-current')).toBe(
      'page'
    );

    fireEvent.click(screen.getByRole('button', { name: /运行日志/ }));
    expect(await screen.findByText('暂无日志记录')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /关于/ }));
    expect(await screen.findByText('版本 1.0.0')).toBeTruthy();
    expect(screen.getByRole('button', { name: /关于/ }).getAttribute('aria-current')).toBe('page');
  });
});
