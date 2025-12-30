import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  AppConfig,
  DEFAULT_APP_SETTINGS,
  createAuthService,
  createConfigManager,
  createAccountManager,
  createWifiManager,
  createNetworkDetector,
  createLogger,
  type AuthService,
  type ConfigManager,
  type AccountManager,
  type WifiManager,
  type NetworkDetector,
  type Logger,
  type AccountConfig,
} from '@repo/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getNetworkInfo,
  requestLocationPermission,
  hasLocationPermission,
  isNativeModuleAvailable,
  type NetworkInfo,
} from '../native/WifiModule';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

interface AppContextType {
  // 配置
  config: AppConfig;
  setConfig: (config: AppConfig) => void;

  // 网络状态
  networkStatus: 'connected' | 'disconnected' | 'connecting';
  networkInfo: NetworkInfo;
  ipAddress: string;

  // 认证操作
  login: () => Promise<void>;
  logout: () => Promise<void>;

  // 账户管理
  accounts: AccountConfig[];
  currentAccount: AccountConfig | null;
  addAccount: (account: Omit<AccountConfig, 'id'>) => Promise<AccountConfig>;
  updateAccount: (id: string, updates: Partial<AccountConfig>) => Promise<AccountConfig>;
  removeAccount: (id: string) => Promise<void>;
  switchAccount: (id: string) => Promise<void>;

  // 日志
  logs: LogEntry[];
  addLog: (level: LogEntry['level'], message: string) => void;
  clearLogs: () => void;

  // WiFi 权限
  hasPermission: boolean;
  requestPermission: () => Promise<boolean>;
  isModuleAvailable: boolean;

  // 刷新网络信息
  refreshNetworkInfo: () => Promise<void>;

  // 服务引用（供高级用例使用）
  services: {
    authService: AuthService;
    configManager: ConfigManager;
    accountManager: AccountManager;
    wifiManager: WifiManager;
    networkDetector: NetworkDetector;
    logger: Logger;
  } | null;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

/**
 * 创建 React Native 存储适配器
 */
function createReactNativeStorage() {
  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const value = await AsyncStorage.getItem(key);
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    },
    async remove(key: string): Promise<void> {
      await AsyncStorage.removeItem(key);
    },
  };
}

const defaultNetworkInfo: NetworkInfo = {
  wifiEnabled: false,
  connected: false,
  ssid: null,
  ipv4: null,
  ipv6: null,
  mac: null,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 服务引用
  const servicesRef = useRef<AppContextType['services']>(null);

  // 配置状态
  const [config, setConfigState] = useState<AppConfig>({
    accounts: [],
    currentAccountId: null,
    wifiList: [],
    settings: DEFAULT_APP_SETTINGS,
  });

  // 网络状态
  const [networkStatus, setNetworkStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>(defaultNetworkInfo);
  const [hasPermission, setHasPermission] = useState(false);
  const isModuleAvailable = isNativeModuleAvailable();

  // 账户状态
  const [accounts, setAccounts] = useState<AccountConfig[]>([]);
  const [currentAccount, setCurrentAccount] = useState<AccountConfig | null>(null);

  // 日志状态
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // 添加日志
  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    };
    setLogs(prev => [newLog, ...prev].slice(0, 500)); // 最多保留 500 条
  }, []);

  // 清空日志
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // 初始化服务
  useEffect(() => {
    const initServices = async () => {
      try {
        addLog('info', '正在初始化应用...');

        // 创建存储适配器
        const storage = createReactNativeStorage();

        // 创建服务
        const logger = createLogger(500);
        const configManager = createConfigManager(storage);
        const authService = createAuthService();
        const accountManager = createAccountManager(configManager);
        const wifiManager = createWifiManager(configManager);
        const networkDetector = createNetworkDetector();

        // 加载配置
        await configManager.load();
        const loadedConfig = configManager.getConfig();
        setConfigState(loadedConfig);
        setAccounts(loadedConfig.accounts);

        // 设置当前账户
        if (loadedConfig.currentAccountId) {
          const account = accountManager.getAccountById(loadedConfig.currentAccountId);
          setCurrentAccount(account);
        }

        // 保存服务引用
        servicesRef.current = {
          authService,
          configManager,
          accountManager,
          wifiManager,
          networkDetector,
          logger,
        };

        addLog('success', '配置加载完成');

        // 检查权限并获取网络信息
        const permission = await hasLocationPermission();
        setHasPermission(permission);

        if (isModuleAvailable) {
          const info = await getNetworkInfo();
          setNetworkInfo(info);
          if (info.connected && info.ssid) {
            addLog('info', `已连接到 WiFi: ${info.ssid}`);
          }
          if (info.ipv4) {
            addLog('info', `IP 地址: ${info.ipv4}`);
          }
        }

        addLog('info', '应用初始化完成');
      } catch (error) {
        addLog('error', `初始化失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    };

    initServices();
  }, [addLog, isModuleAvailable]);

  // 刷新网络信息
  const refreshNetworkInfo = useCallback(async () => {
    if (!isModuleAvailable) return;

    try {
      const info = await getNetworkInfo();
      setNetworkInfo(info);
    } catch (error) {
      console.warn('刷新网络信息失败:', error);
    }
  }, [isModuleAvailable]);

  // 请求位置权限
  const requestPermission = useCallback(async (): Promise<boolean> => {
    const granted = await requestLocationPermission();
    setHasPermission(granted);
    if (granted) {
      addLog('success', '位置权限已授予');
      await refreshNetworkInfo();
    } else {
      addLog('warn', '位置权限被拒绝');
    }
    return granted;
  }, [addLog, refreshNetworkInfo]);

  // 更新配置
  const setConfig = useCallback((newConfig: AppConfig) => {
    setConfigState(newConfig);
    servicesRef.current?.configManager.updateConfig(newConfig);
  }, []);

  // 登录
  const login = useCallback(async () => {
    if (!servicesRef.current) {
      addLog('error', '服务未初始化');
      return;
    }

    if (!currentAccount) {
      addLog('error', '请先选择账户');
      return;
    }

    // 刷新网络信息获取最新 IP
    await refreshNetworkInfo();

    if (!networkInfo.ipv4) {
      addLog('error', '无法获取 IP 地址，请检查网络连接');
      return;
    }

    addLog('info', `正在登录账户: ${currentAccount.username}...`);
    setNetworkStatus('connecting');

    try {
      const { authService } = servicesRef.current;
      authService.setServerUrl(currentAccount.serverUrl);

      const result = await authService.login({
        serverUrl: currentAccount.serverUrl,
        userAccount: currentAccount.username,
        userPassword: currentAccount.password,
        wlanUserIp: networkInfo.ipv4,
        wlanUserIpv6: networkInfo.ipv6 || undefined,
        wlanUserMac: networkInfo.mac || undefined,
        isp: currentAccount.isp,
      });

      if (result.success) {
        setNetworkStatus('connected');
        addLog('success', `登录成功: ${result.message}`);
      } else {
        setNetworkStatus('disconnected');
        addLog('error', `登录失败: ${result.message}`);
      }
    } catch (error) {
      setNetworkStatus('disconnected');
      addLog('error', `登录异常: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [currentAccount, networkInfo, addLog, refreshNetworkInfo]);

  // 登出
  const logout = useCallback(async () => {
    if (!servicesRef.current) {
      addLog('error', '服务未初始化');
      return;
    }

    if (!networkInfo.ipv4) {
      addLog('error', '无法获取 IP 地址');
      return;
    }

    addLog('info', '正在登出...');

    try {
      const { authService } = servicesRef.current;
      const result = await authService.logout(networkInfo.ipv4);

      if (result.success) {
        setNetworkStatus('disconnected');
        addLog('success', '登出成功');
      } else {
        addLog('warn', `登出失败: ${result.message}`);
      }
    } catch (error) {
      addLog('error', `登出异常: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [networkInfo.ipv4, addLog]);

  // 账户管理
  const addAccount = useCallback(async (account: Omit<AccountConfig, 'id'>): Promise<AccountConfig> => {
    if (!servicesRef.current) {
      throw new Error('服务未初始化');
    }

    const newAccount = await servicesRef.current.accountManager.addAccount(account);
    setAccounts(prev => [...prev, newAccount]);

    // 如果是第一个账户，自动设为当前账户
    if (accounts.length === 0) {
      await servicesRef.current.accountManager.setCurrentAccount(newAccount.id);
      setCurrentAccount(newAccount);
    }

    addLog('success', `添加账户: ${newAccount.username}`);
    return newAccount;
  }, [accounts.length, addLog]);

  const updateAccount = useCallback(async (id: string, updates: Partial<AccountConfig>): Promise<AccountConfig> => {
    if (!servicesRef.current) {
      throw new Error('服务未初始化');
    }

    const updated = await servicesRef.current.accountManager.updateAccount(id, updates);
    setAccounts(prev => prev.map(a => a.id === id ? updated : a));

    if (currentAccount?.id === id) {
      setCurrentAccount(updated);
    }

    addLog('info', `更新账户: ${updated.username}`);
    return updated;
  }, [currentAccount?.id, addLog]);

  const removeAccount = useCallback(async (id: string): Promise<void> => {
    if (!servicesRef.current) {
      throw new Error('服务未初始化');
    }

    const account = servicesRef.current.accountManager.getAccountById(id);
    await servicesRef.current.accountManager.removeAccount(id);
    setAccounts(prev => prev.filter(a => a.id !== id));

    if (currentAccount?.id === id) {
      setCurrentAccount(null);
    }

    addLog('warn', `删除账户: ${account?.username || id}`);
  }, [currentAccount?.id, addLog]);

  const switchAccount = useCallback(async (id: string): Promise<void> => {
    if (!servicesRef.current) {
      throw new Error('服务未初始化');
    }

    await servicesRef.current.accountManager.setCurrentAccount(id);
    const account = servicesRef.current.accountManager.getAccountById(id);
    setCurrentAccount(account);

    addLog('info', `切换到账户: ${account?.username || id}`);
  }, [addLog]);

  const ipAddress = networkInfo.ipv4 || '0.0.0.0';

  return (
    <AppContext.Provider
      value={{
        config,
        setConfig,
        networkStatus,
        networkInfo,
        ipAddress,
        login,
        logout,
        accounts,
        currentAccount,
        addAccount,
        updateAccount,
        removeAccount,
        switchAccount,
        logs,
        addLog,
        clearLogs,
        hasPermission,
        requestPermission,
        isModuleAvailable,
        refreshNetworkInfo,
        services: servicesRef.current,
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
