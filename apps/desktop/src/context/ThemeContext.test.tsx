import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeContext';

const Probe = () => {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <span>{theme}</span>
      <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        切换
      </button>
    </>
  );
};

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
  });

  it('优先读取本地主题并同步 body 类名', () => {
    localStorage.setItem('theme', 'dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    expect(screen.getByText('dark')).toBeTruthy();
    expect(document.body.classList.contains('dark')).toBe(true);
  });

  it('无本地配置时跟随系统深色偏好', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    expect(screen.getByText('dark')).toBeTruthy();
    expect(document.body.classList.contains('dark')).toBe(true);
  });

  it('切换主题后立即更新 DOM 并持久化', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByText('light')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '切换' }));

    expect(screen.getByText('dark')).toBeTruthy();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.body.classList.contains('dark')).toBe(true);
    expect(document.body.classList.contains('light')).toBe(false);
  });

  it('useTheme 在 Provider 外使用时明确报错', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow('useTheme must be used within a ThemeProvider');
    consoleError.mockRestore();
  });
});
