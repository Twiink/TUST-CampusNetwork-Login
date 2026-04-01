import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { About } from './About';

describe('About', () => {
  beforeEach(() => {
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

  it('应展示当前版本和真实仓库链接', async () => {
    render(<About />);

    await waitFor(() => {
      expect(screen.getByText('版本 1.0.0')).not.toBeNull();
    });

    expect(screen.getByRole('link', { name: 'GitHub 仓库' }).getAttribute('href')).toBe(
      'https://github.com/Twiink/TUST-Campusnet-Login'
    );
  });
});
