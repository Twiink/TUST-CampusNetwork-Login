import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import type { AppConfig, ConnectionStatus } from '@repo/shared';
import { useAuth } from '../hooks/useAuth';
import { useNetwork } from '../hooks/useNetwork';
import { useLogs } from '../hooks/useLogs';
import { useConfig } from '../hooks/useConfig';

interface DisplayLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'debug';
  message: string;
}

interface AppContextType {
  config: AppConfig | null;
  setConfig: (config: AppConfig) => void;
  networkStatus: ConnectionStatus;
  ipAddress: string;
  logs: DisplayLogEntry[];
  login: () => Promise<void>;
  logout: () => Promise<void>;
  clearLogs: () => void;
  loading: boolean;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 使用 hooks
  const {
    status: authStatus,
    login: authLogin,
    logout: authLogout,
    loading: authLoading,
  } = useAuth();
  const { isAuthenticated, ipAddress } = useNetwork();
  const { logs, clearLogs: clearLogsAction, loading: logsLoading } = useLogs();
  const { config, updateConfig, loading: configLoading } = useConfig();

  // Theme state
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const setTheme = useCallback((newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  }, []);

  // Apply theme to body
  useEffect(() => {
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(theme);
  }, [theme]);

  // 计算连接状态
  const getConnectionStatus = useCallback((): ConnectionStatus => {
    if (authStatus === 'authenticating') return 'connecting';
    if (isAuthenticated) return 'connected';
    return 'disconnected';
  }, [authStatus, isAuthenticated]);

  const login = useCallback(async () => {
    await authLogin();
  }, [authLogin]);

  const logout = useCallback(async () => {
    await authLogout();
  }, [authLogout]);

  const clearLogs = useCallback(() => {
    clearLogsAction();
  }, [clearLogsAction]);

  const setConfig = useCallback(
    (newConfig: AppConfig) => {
      updateConfig(newConfig);
    },
    [updateConfig]
  );

  // 转换日志格式以兼容旧接口
  const formattedLogs: DisplayLogEntry[] = logs.map((log) => ({
    id: log.id,
    level: log.level,
    message: log.message,
    timestamp:
      log.timestamp instanceof Date
        ? log.timestamp.toLocaleTimeString()
        : new Date(log.timestamp).toLocaleTimeString(),
  }));

  return (
    <AppContext.Provider
      value={{
        config: config || {
          accounts: [],
          currentAccountId: null,
          wifiList: [],
          settings: {
            autoLaunch: false,
            enableHeartbeat: false,
            pollingInterval: 30,
            autoReconnect: true,
            maxRetries: 3,
            showNotification: true,
            autoUpdate: true,
          },
        },
        setConfig,
        networkStatus: getConnectionStatus(),
        ipAddress: ipAddress,
        logs: formattedLogs,
        login,
        logout,
        clearLogs,
        loading: authLoading || logsLoading || configLoading,
        theme,
        setTheme,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
