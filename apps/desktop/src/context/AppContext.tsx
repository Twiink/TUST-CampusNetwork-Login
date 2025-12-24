import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppConfig, DEFAULT_APP_SETTINGS, DEFAULT_SERVER_URL } from '@repo/shared';

interface LogEntry {
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
  logs: LogEntry[];
  login: () => Promise<void>;
  logout: () => Promise<void>;
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
      timestamp: '10:00:01',
      level: 'info',
      message: '应用初始化程序启动...',
    },
    {
      id: '2',
      timestamp: '10:00:02',
      level: 'success',
      message: '本地配置文件加载成功',
    },
    {
      id: '3',
      timestamp: '10:00:05',
      level: 'info',
      message: '正在扫描可用网络接口...',
    },
    {
      id: '4',
      timestamp: '10:00:08',
      level: 'success',
      message: '识别到校园网 WiFi: TUST-Guest',
    },
    {
      id: '5',
      timestamp: '10:00:10',
      level: 'warn',
      message: 'WiFi 信号强度中等 (-65dBm)',
    },
    {
      id: '6',
      timestamp: '10:00:12',
      level: 'info',
      message: '正在尝试通过默认网关鉴权...',
    },
    {
      id: '7',
      timestamp: '10:00:15',
      level: 'error',
      message: '鉴权服务器响应超时 (Timeout: 3000ms)',
    },
    {
      id: '8',
      timestamp: '10:00:18',
      level: 'info',
      message: '切换至备用鉴权节点 (Node-B)...',
    },
    {
      id: '9',
      timestamp: '10:00:20',
      level: 'success',
      message: '备用节点连接成功，开始发送握手协议',
    },
    {
      id: '10',
      timestamp: '10:00:22',
      level: 'info',
      message: '正在验证用户凭据 (2023******)...',
    },
    {
      id: '11',
      timestamp: '10:00:25',
      level: 'success',
      message: '身份验证通过，正在分配 IP 地址',
    },
    {
      id: '12',
      timestamp: '10:00:26',
      level: 'info',
      message: '内网 IP: 10.10.102.123 分配完毕',
    },
    {
      id: '13',
      timestamp: '10:00:27',
      level: 'success',
      message: '系统准备就绪，网络连接已建立',
    },
    {
      id: '14',
      timestamp: '10:00:30',
      level: 'info',
      message: '心跳包发送中，维持在线状态...',
    },
    {
      id: '15',
      timestamp: '10:00:45',
      level: 'info',
      message: '流量统计: 上行 1.2MB, 下行 15.8MB',
    },
  ]);

  const addLog = (level: LogEntry['level'], message: string) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    };
    setLogs((prev) => [newLog, ...prev]);
  };

  const clearLogs = () => setLogs([]);

  const login = async () => {
    setNetworkStatus('connecting');
    addLog('info', '开始登录流程...');
    setTimeout(() => {
      setNetworkStatus('connected');
      setIpAddress('10.10.102.123'); // Mock
      addLog('success', '登录成功，欢迎使用');
    }, 1500);
  };

  const logout = async () => {
    setNetworkStatus('disconnected');
    setIpAddress('0.0.0.0');
    addLog('info', '已断开连接');
  };

  return (
    <AppContext.Provider value={{ config, setConfig, networkStatus, ipAddress, logs, login, logout, clearLogs }}>
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
