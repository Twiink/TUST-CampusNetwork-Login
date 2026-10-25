import React, { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';
import { DEFAULT_APP_SETTINGS, type AppConfig, type ConnectionStatus } from '@repo/shared';
import { useAuth } from '../hooks/useAuth';
import { useNetwork } from '../hooks/useNetwork';
import { useLogs } from '../hooks/useLogs';
import { useConfig } from '../hooks/useConfig';

export interface DisplayLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'debug';
  message: string;
}

interface AppContextType {
  config: AppConfig | null;
  setConfig: (config: AppConfig) => void;
  networkStatus: ConnectionStatus;
  status: ReturnType<typeof useNetwork>['status'];
  info: ReturnType<typeof useNetwork>['info'];
  wifiStatus: ReturnType<typeof useNetwork>['wifiStatus'];
  fetchStatus: ReturnType<typeof useNetwork>['fetchStatus'];
  loading: boolean;
  initialCheckDone: boolean;
  isConnected: boolean;
  wifiConnected: boolean;
  wifiSSID: string | null;
  ipAddress: string;
  isAuthenticated: boolean;
  logs: DisplayLogEntry[];
  login: () => Promise<void>;
  logout: () => Promise<void>;
  clearLogs: () => void;
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
  const {
    status: networkStatusDetail,
    info: networkInfo,
    wifiStatus,
    fetchStatus,
    loading: networkLoading,
    initialCheckDone,
    isConnected,
    isAuthenticated,
    ipAddress,
    wifiConnected,
    wifiSSID,
  } = useNetwork();
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
  const formattedLogs: DisplayLogEntry[] = useMemo(
    () =>
      logs.map((log) => ({
        id: log.id,
        level: log.level,
        message: log.message,
        timestamp:
          log.timestamp instanceof Date
            ? log.timestamp.toLocaleTimeString()
            : new Date(log.timestamp).toLocaleTimeString(),
      })),
    [logs]
  );

  return (
    <AppContext.Provider
      value={{
        config: config || {
          accounts: [],
          currentAccountId: null,
          wifiList: [],
          settings: DEFAULT_APP_SETTINGS,
        },
        setConfig,
        networkStatus: getConnectionStatus(),
        status: networkStatusDetail,
        info: networkInfo,
        wifiStatus,
        fetchStatus,
        loading: authLoading || logsLoading || configLoading || networkLoading,
        initialCheckDone,
        isConnected,
        isAuthenticated,
        ipAddress: ipAddress,
        wifiConnected,
        wifiSSID,
        logs: formattedLogs,
        login,
        logout,
        clearLogs,
        theme,
        setTheme,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
