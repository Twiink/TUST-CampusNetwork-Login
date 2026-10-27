import React, { type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';

function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

describe('ThemeProvider', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('默认使用深色主题，并持久化手动切换', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.themeMode).toBe('dark');
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
    await act(async () => {
      result.current.setTheme('light');
    });

    expect(result.current.themeMode).toBe('light');
    await waitFor(async () => {
      expect(await AsyncStorage.getItem('@netmate_theme_mode')).toBe('light');
    });

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.themeMode).toBe('dark');
  });

  it('启动时恢复已保存主题', async () => {
    await AsyncStorage.setItem('@netmate_theme_mode', 'light');
    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => expect(result.current.themeMode).toBe('light'));
  });
});
