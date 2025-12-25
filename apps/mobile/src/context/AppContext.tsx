import React, { createContext, useContext, useState, useCallback } from 'react';
import { AppConfig, DEFAULT_APP_SETTINGS } from '@repo/shared';

// Mocking @repo/shared if import fails in RN due to symlink issues, 
// but it should work with Metro config. 
// If it fails, we might need to adjust Metro config.
// For now assuming it works.

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

interface AppContextType {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  networkStatus: 'connected' | 'disconnected' | 'connecting';
  ipAddress: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  logs: LogEntry[];
  addLog: (level: LogEntry['level'], message: string) => void;
  clearLogs: () => void;
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
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: '1',
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toLocaleTimeString(),
      level: 'info',
      message: 'Application initializing...'
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 1000 * 60 * 4.9).toLocaleTimeString(),
      level: 'info',
      message: 'Loading configuration from secure storage.'
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 1000 * 60 * 4.8).toLocaleTimeString(),
      level: 'success',
      message: 'Configuration loaded successfully.'
    },
    {
      id: '4',
      timestamp: new Date(Date.now() - 1000 * 60 * 4.5).toLocaleTimeString(),
      level: 'info',
      message: 'Checking network connectivity...'
    },
    {
      id: '5',
      timestamp: new Date(Date.now() - 1000 * 60 * 4.2).toLocaleTimeString(),
      level: 'warn',
      message: 'Network signal strength is weak (-85dBm).'
    },
    {
      id: '6',
      timestamp: new Date(Date.now() - 1000 * 60 * 4.0).toLocaleTimeString(),
      level: 'info',
      message: 'Attempting auto-login for account: 20210001'
    },
    {
      id: '7',
      timestamp: new Date(Date.now() - 1000 * 60 * 3.8).toLocaleTimeString(),
      level: 'error',
      message: 'Connection timed out. Retrying in 5 seconds.'
    },
    {
      id: '8',
      timestamp: new Date(Date.now() - 1000 * 60 * 3.5).toLocaleTimeString(),
      level: 'info',
      message: 'Retrying connection...'
    },
    {
      id: '9',
      timestamp: new Date(Date.now() - 1000 * 60 * 3.2).toLocaleTimeString(),
      level: 'success',
      message: 'Network interface initialized.'
    },
    {
      id: '10',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: 'System ready. Waiting for user input.'
    }
  ]);

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    };
    setLogs(prev => [newLog, ...prev]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const login = async () => {
    addLog('info', 'Initiating login sequence...');
    setNetworkStatus('connecting');
    setTimeout(() => {
      setNetworkStatus('connected');
      setIpAddress('10.10.102.123'); // Mock
      addLog('success', 'Connected successfully. IP: 10.10.102.123');
    }, 1500);
  };

  const logout = async () => {
    addLog('info', 'Logging out...');
    setNetworkStatus('disconnected');
    setIpAddress('0.0.0.0');
    addLog('warn', 'Disconnected from network.');
  };

  return (
    <AppContext.Provider value={{ config, setConfig, networkStatus, ipAddress, login, logout, logs, addLog, clearLogs }}>
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
