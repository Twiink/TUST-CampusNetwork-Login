import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultAppConfig } from '@repo/shared';
import { useConfig, useSettings } from './useConfig';

describe('useConfig', () => {
  const initial = createDefaultAppConfig();

  beforeEach(() => {
    vi.mocked(window.electronAPI.config.get).mockResolvedValue(initial);
    vi.mocked(window.electronAPI.config.set).mockResolvedValue(true);
    vi.mocked(window.electronAPI.config.reset).mockResolvedValue(initial);
  });

  it('加载配置并持久化更新', async () => {
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).toEqual(initial));

    const next = {
      ...initial,
      settings: { ...initial.settings, autoReconnect: false },
    };
    await act(async () => {
      await result.current.updateConfig(next);
    });

    expect(window.electronAPI.config.set).toHaveBeenCalledWith(next);
    expect(result.current.config?.settings.autoReconnect).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('主进程拒绝保存时抛出错误且不更新本地状态', async () => {
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).toEqual(initial));
    vi.mocked(window.electronAPI.config.set).mockResolvedValue(false);

    let error: unknown;
    await act(async () => {
      error = await result.current
        .updateConfig({ ...initial, settings: { ...initial.settings, autoReconnect: false } })
        .catch((reason) => reason);
    });

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('保存配置失败');
    expect(result.current.config).toEqual(initial);
    expect(result.current.error).toBe('保存配置失败');
  });

  it('连续函数式更新会串行合并，不会用旧配置覆盖前一次修改', async () => {
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).toEqual(initial));

    await act(async () => {
      const first = result.current.updateConfig((current) => ({
        ...current,
        settings: { ...current.settings, autoReconnect: false },
      }));
      const second = result.current.updateConfig((current) => ({
        ...current,
        settings: { ...current.settings, enableHeartbeat: false },
      }));
      await Promise.all([first, second]);
    });

    const calls = vi.mocked(window.electronAPI.config.set).mock.calls;
    const lastSaved = calls[calls.length - 1]?.[0];
    expect(lastSaved?.settings).toMatchObject({
      autoReconnect: false,
      enableHeartbeat: false,
    });
    expect(result.current.config?.settings).toMatchObject({
      autoReconnect: false,
      enableHeartbeat: false,
    });
  });

  it('加载失败会暴露可读错误并结束加载状态', async () => {
    vi.mocked(window.electronAPI.config.get).mockRejectedValue(new Error('磁盘不可读'));
    const { result } = renderHook(() => useConfig());

    await waitFor(() => expect(result.current.error).toBe('磁盘不可读'));
    expect(result.current.loading).toBe(false);
    expect(result.current.config).toBeNull();
  });

  it('重置配置会替换当前状态', async () => {
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).toEqual(initial));
    const resetConfig = {
      ...initial,
      accounts: [],
    };
    vi.mocked(window.electronAPI.config.reset).mockResolvedValue(resetConfig);

    await act(async () => {
      await expect(result.current.resetConfig()).resolves.toEqual(resetConfig);
    });
    expect(result.current.config).toEqual(resetConfig);
  });
});

describe('useSettings', () => {
  const settings = createDefaultAppConfig().settings;

  beforeEach(() => {
    vi.mocked(window.electronAPI.settings.get).mockResolvedValue(settings);
    vi.mocked(window.electronAPI.settings.update).mockResolvedValue({
      ...settings,
      autoLaunch: true,
    });
  });

  it('加载并更新设置', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings).toEqual(settings));

    await act(async () => {
      await result.current.updateSettings({ autoLaunch: true });
    });

    expect(window.electronAPI.settings.update).toHaveBeenCalledWith({ autoLaunch: true });
    expect(result.current.settings?.autoLaunch).toBe(true);
  });

  it('更新设置失败时保留旧状态', async () => {
    vi.mocked(window.electronAPI.settings.update).mockRejectedValue(new Error('写入失败'));
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings).toEqual(settings));

    await act(async () => {
      await expect(result.current.updateSettings({ autoLaunch: true })).rejects.toThrow('写入失败');
    });
    expect(result.current.settings).toEqual(settings);
    expect(result.current.error).toBe('写入失败');
  });
});
