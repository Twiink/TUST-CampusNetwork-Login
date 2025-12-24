import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppConfig, DEFAULT_APP_SETTINGS, DEFAULT_SERVER_URL } from '@repo/shared';

interface AppContextType {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  networkStatus: 'connected' | 'disconnected' | 'connecting';
  ipAddress: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<AppConfig>({
    accounts: [],
    currentAccountId: null,
    wifiList: [],
    settings: DEFAULT_APP_SETTINGS,
  });

  const [networkStatus, setNetworkStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [ipAddress, setIpAddress] = useState<string>('0.0.0.0');

  const login = async () => {
    setNetworkStatus('connecting');
    setTimeout(() => {
      setNetworkStatus('connected');
      setIpAddress('10.10.102.123'); // Mock
    }, 1500);
  };

  const logout = async () => {
    setNetworkStatus('disconnected');
    setIpAddress('0.0.0.0');
  };

  return (
    <AppContext.Provider value={{ config, setConfig, networkStatus, ipAddress, login, logout }}>
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
