import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { DEFAULT_APP_SETTINGS, type AppConfig, type ConnectionStatus } from '@repo/shared';
import { useAuth } from '../hooks/useAuth';
import { useNetwork } from '../hooks/useNetwork';
import { useConfig, type ConfigUpdate } from '../hooks/useConfig';

export interface DisplayLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'debug';
  message: string;
}

interface AppContextType {
  configurationState: 'idle' | 'saving' | 'saved' | 'error';
  configurationError: string | null;
  config: AppConfig | null;
  setConfig: (update: ConfigUpdate) => Promise<void>;
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
  login: () => Promise<void>;
  logout: () => Promise<void>;
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
    setAuthenticated,
  } = useNetwork();
  const {
    config,
    updateConfig,
    loading: configLoading,
    saveState,
    error: configurationError,
  } = useConfig();

  // 计算连接状态
  const getConnectionStatus = useCallback((): ConnectionStatus => {
    if (authStatus === 'authenticating') return 'connecting';
    if (isConnected) return 'connected';
    return 'disconnected';
  }, [authStatus, isConnected]);

  const login = useCallback(async () => {
    const result = await authLogin();
    if (result.success) {
      setAuthenticated(true);
    }
  }, [authLogin, setAuthenticated]);

  const logout = useCallback(async () => {
    const result = await authLogout();
    if (result.success) {
      setAuthenticated(false);
    }
  }, [authLogout, setAuthenticated]);

  const setConfig = useCallback(
    async (update: ConfigUpdate) => {
      await updateConfig(update);
    },
    [updateConfig]
  );

  const value = useMemo(
    () => ({
      config: config || {
        accounts: [],
        currentAccountId: null,
        wifiList: [],
        settings: DEFAULT_APP_SETTINGS,
      },
      setConfig,
      configurationState: saveState,
      configurationError,
      networkStatus: getConnectionStatus(),
      status: networkStatusDetail,
      info: networkInfo,
      wifiStatus,
      fetchStatus,
      loading: authLoading || configLoading || networkLoading,
      initialCheckDone,
      isConnected,
      isAuthenticated,
      ipAddress: ipAddress,
      wifiConnected,
      wifiSSID,
      login,
      logout,
    }),
    [
      config,
      saveState,
      configurationError,
      setConfig,
      getConnectionStatus,
      networkStatusDetail,
      networkInfo,
      wifiStatus,
      fetchStatus,
      authLoading,
      configLoading,
      networkLoading,
      initialCheckDone,
      isConnected,
      isAuthenticated,
      ipAddress,
      wifiConnected,
      wifiSSID,
      login,
      logout,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
