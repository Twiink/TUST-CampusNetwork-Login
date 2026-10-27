import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from './useAuth';

describe('useAuth', () => {
  it('登录成功时切换认证状态并结束加载', async () => {
    let resolveLogin!: (value: { success: boolean; message: string }) => void;
    vi.mocked(window.electronAPI.auth.login).mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      })
    );
    const { result } = renderHook(() => useAuth());

    let loginPromise!: Promise<{ success: boolean; message: string }>;
    act(() => {
      loginPromise = result.current.login();
    });

    expect(result.current.status).toBe('authenticating');
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveLogin({ success: true, message: '登录成功' });
      await loginPromise;
    });

    expect(result.current.status).toBe('authenticated');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('登录响应失败时保留原因并标记 failed', async () => {
    vi.mocked(window.electronAPI.auth.login).mockResolvedValue({
      success: false,
      message: '密码错误',
    });
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await expect(result.current.login()).resolves.toEqual({
        success: false,
        message: '密码错误',
      });
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('密码错误');
  });

  it('登录异常转换为可展示错误而不会向外抛出', async () => {
    vi.mocked(window.electronAPI.auth.login).mockRejectedValue(new Error('网络中断'));
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await expect(result.current.login()).resolves.toEqual({
        success: false,
        message: '网络中断',
      });
    });
    expect(result.current.status).toBe('failed');
    expect(result.current.error).toBe('网络中断');

    vi.mocked(window.electronAPI.auth.login).mockRejectedValue('connection lost');
    await act(async () => {
      await expect(result.current.login()).resolves.toEqual({
        success: false,
        message: '登录失败',
      });
    });
    expect(result.current.error).toBe('登录失败');
  });

  it('登出成功后回到 idle，失败时保留认证状态并暴露错误', async () => {
    vi.mocked(window.electronAPI.auth.login).mockResolvedValue({
      success: true,
      message: '登录成功',
    });
    vi.mocked(window.electronAPI.auth.logout)
      .mockRejectedValueOnce(new Error('注销接口不可用'))
      .mockResolvedValueOnce({ success: true, message: '注销成功' });
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login();
    });
    await act(async () => {
      await expect(result.current.logout()).resolves.toEqual({
        success: false,
        message: '注销接口不可用',
      });
    });
    expect(result.current.status).toBe('authenticated');
    expect(result.current.error).toBe('注销接口不可用');

    await act(async () => {
      await expect(result.current.logout()).resolves.toEqual({
        success: true,
        message: '注销成功',
      });
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('允许外部同步认证状态', () => {
    const { result } = renderHook(() => useAuth());
    act(() => result.current.setStatus('authenticated'));
    expect(result.current.status).toBe('authenticated');
  });
});
