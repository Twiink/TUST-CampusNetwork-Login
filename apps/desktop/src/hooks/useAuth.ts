/**
 * 认证 Hook
 */

import { useState, useCallback } from 'react';
import type { LoginResult, LogoutResult, AuthStatus } from '@repo/shared';

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (): Promise<LoginResult> => {
    setLoading(true);
    setError(null);
    setStatus('authenticating');

    try {
      const result = await window.electronAPI.auth.login();
      if (result.success) {
        setStatus('authenticated');
      } else {
        setStatus('failed');
        setError(result.message);
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败';
      setStatus('failed');
      setError(message);
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<LogoutResult> => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.auth.logout();
      if (result.success) {
        setStatus('idle');
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '登出失败';
      setError(message);
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    status,
    loading,
    error,
    login,
    logout,
    setStatus,
  };
}
