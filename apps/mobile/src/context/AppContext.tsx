import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  createDefaultAppConfig,
  type AppConfig,
  type AccountConfig,
  type AccountManager,
  type AuthService,
  type ConfigManager,
  type Logger,
  type NetworkDetector,
  type WifiManager,
} from '@repo/shared';
import {
  getNetworkInfo,
  requestLocationPermission,
  hasLocationPermission,
  isNativeModuleAvailable,
  type NetworkInfo,
} from '../native/WifiModule';
import {
  isBackgroundServiceAvailable,
  isBackgroundServiceRunning,
  startBackgroundService,
  stopBackgroundService,
} from '../native/BackgroundService';
import { createMobileServices } from './mobileServices';
import { useAccountActions } from './useAccountActions';
import { isAutoStartAvailable, setAutoStartEnabled } from '../native/AutoStart';
import { useAutoAuth } from '../hooks/useAutoAuth';
import { usePermissionGuide } from '../hooks/usePermissionGuide';
import { autoCheckForUpdate } from '../native/AppUpdater';
import type { PermissionItem, PermissionKey } from '../native/Permissions';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export type ConfigUpdate = AppConfig | ((current: AppConfig) => AppConfig);

function getConfigPatch(current: AppConfig, next: AppConfig): Partial<AppConfig> {
  const patch: Partial<AppConfig> = {};
  if (next.version !== current.version) patch.version = next.version;
  if (next.accounts !== current.accounts) patch.accounts = next.accounts;
  if (next.currentAccountId !== current.currentAccountId) {
    patch.currentAccountId = next.currentAccountId;
  }
  if (next.wifiList !== current.wifiList) patch.wifiList = next.wifiList;
  if (next.settings !== current.settings) patch.settings = next.settings;
  return patch;
}

interface AppContextType {
  // 配置
  config: AppConfig;
  setConfig: (update: ConfigUpdate) => void;

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

  // 权限引导（自动认证所需权限的状态与申请）
  permissionItems: PermissionItem[];
  requestAppPermission: (key: PermissionKey) => Promise<void>;
  runPermissionGuide: () => Promise<void>;

  // 刷新网络信息（返回本次读取的最新值；模块不可用或读取失败时为 null）
  refreshNetworkInfo: () => Promise<NetworkInfo | null>;

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
  const [config, setConfigState] = useState<AppConfig>(() => createDefaultAppConfig());
  const configRef = useRef<AppConfig>(config);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());

  // 网络状态
  const [networkStatus, setNetworkStatus] = useState<'connected' | 'disconnected' | 'connecting'>(
    'disconnected'
  );
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>(defaultNetworkInfo);
  const [hasPermission, setHasPermission] = useState(false);
  const [servicesReady, setServicesReady] = useState(false);
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

  const applyConfigState = useCallback((nextConfig: AppConfig) => {
    configRef.current = nextConfig;
    setConfigState(nextConfig);
    setAccounts(nextConfig.accounts);
    setCurrentAccount(
      nextConfig.currentAccountId
        ? (nextConfig.accounts.find(account => account.id === nextConfig.currentAccountId) ?? null)
        : null
    );
  }, []);

  // 初始化服务
  useEffect(() => {
    let mounted = true;
    let logger: Logger | null = null;

    const initServices = async () => {
      try {
        addLog('info', '正在初始化应用...');

        // 创建服务
        const services = createMobileServices();
        logger = services.logger;
        const { configManager, authService, accountManager, wifiManager, networkDetector } =
          services;

        // 加载配置
        await configManager.load();

        if (!mounted) {
          return;
        }

        const loadedConfig = configManager.getConfig();
        if (loadedConfig) {
          applyConfigState(loadedConfig);
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
        setServicesReady(true);

        addLog('success', '配置加载完成');

        // 检查权限并获取网络信息
        const permission = await hasLocationPermission();
        if (!mounted) {
          return;
        }
        setHasPermission(permission);

        if (isModuleAvailable) {
          const info = await getNetworkInfo();
          if (!mounted) {
            return;
          }
          setNetworkInfo(info);
          setNetworkStatus(info.connected ? 'connected' : 'disconnected');
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

    return () => {
      mounted = false;
      logger?.stopAutoCleanup();
    };
  }, [addLog, applyConfigState, isModuleAvailable]);

  // 刷新网络信息
  const refreshNetworkInfo = useCallback(async (): Promise<NetworkInfo | null> => {
    if (!isModuleAvailable) return null;

    try {
      const info = await getNetworkInfo();
      setNetworkInfo(info);
      setNetworkStatus(info.connected ? 'connected' : 'disconnected');
      return info;
    } catch (error) {
      console.warn('刷新网络信息失败:', error);
      return null;
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
  const setConfig = useCallback(
    (update: ConfigUpdate) => {
      const current = configRef.current;
      const nextConfig = typeof update === 'function' ? update(current) : update;
      applyConfigState(nextConfig);

      const configManager = servicesRef.current?.configManager;
      if (!configManager) {
        return;
      }

      const patch = getConfigPatch(current, nextConfig);
      if (Object.keys(patch).length === 0) {
        return;
      }

      persistenceQueueRef.current = persistenceQueueRef.current
        .then(() => configManager.update(patch))
        .then(
          () => undefined,
          error => {
            addLog(
              'error',
              `保存配置失败: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        );
    },
    [addLog, applyConfigState]
  );

  // AccountManager 直接写入 ConfigManager；操作完成后同步同一份状态，避免 config/accounts 分叉。
  const syncConfigState = useCallback(() => {
    const latest = servicesRef.current?.configManager.getConfig();
    if (!latest) {
      return;
    }

    applyConfigState(latest);
  }, [applyConfigState]);

  useEffect(() => {
    if (!isAutoStartAvailable()) {
      return;
    }

    setAutoStartEnabled(config.settings.autoLaunch).catch(() => undefined);
  }, [config.settings.autoLaunch]);

  useEffect(() => {
    if (!isBackgroundServiceAvailable()) {
      return;
    }

    const syncBackgroundService = async () => {
      const shouldRun = config.settings.enableHeartbeat || config.settings.autoReconnect;
      const running = await isBackgroundServiceRunning();

      if (shouldRun) {
        // 已运行时再次启动是幂等的，用于把新的检测间隔传给服务
        await startBackgroundService(config.settings.heartbeatIntervalSeconds * 1000);
        if (!running) {
          addLog('info', '后台服务已启动');
        }
      } else if (running) {
        await stopBackgroundService();
        addLog('info', '后台服务已停止');
      }
    };

    syncBackgroundService().catch(() => undefined);
  }, [
    addLog,
    config.settings.autoReconnect,
    config.settings.enableHeartbeat,
    config.settings.heartbeatIntervalSeconds,
  ]);

  // 登录
  const login = useCallback(async () => {
    if (!servicesRef.current) {
      addLog('error', '服务未初始化');
      return;
    }

    const wifiConfig = networkInfo.ssid
      ? config.wifiList.find(wifi => wifi.ssid === networkInfo.ssid)
      : undefined;
    const linkedAccounts =
      wifiConfig?.linkedAccountIds
        .map(id => config.accounts.find(account => account.id === id))
        .filter((account): account is AccountConfig => account !== undefined) ?? [];
    const accountsToLogin =
      linkedAccounts.length > 0 ? linkedAccounts : currentAccount ? [currentAccount] : [];

    if (accountsToLogin.length === 0) {
      addLog('error', '请先选择账户');
      return;
    }

    // 使用本次刷新的返回值：setState 要到下一次渲染才生效，闭包里的 networkInfo 仍是旧值
    const latestInfo = (await refreshNetworkInfo()) ?? networkInfo;

    if (!latestInfo.ipv4) {
      addLog('error', '无法获取 IP 地址，请检查网络连接');
      return;
    }

    addLog('info', `正在登录账户: ${accountsToLogin[0].username}...`);
    setNetworkStatus('connecting');

    try {
      const { authService } = servicesRef.current;
      const primaryAccount = accountsToLogin[0];
      authService.setServerUrl(primaryAccount.serverUrl);

      // 单账号保留 3 次重试；关联多个账号时按配置顺序逐个尝试。
      const result =
        accountsToLogin.length === 1
          ? await authService.loginWithRetry({
              serverUrl: primaryAccount.serverUrl,
              userAccount: primaryAccount.username,
              userPassword: primaryAccount.password,
              wlanUserIp: latestInfo.ipv4,
              wlanUserIpv6: latestInfo.ipv6 || undefined,
              wlanUserMac: latestInfo.mac || undefined,
              isp: primaryAccount.isp,
            })
          : await authService.loginWithAccounts(accountsToLogin, {
              wlanUserIp: latestInfo.ipv4,
              wlanUserIpv6: latestInfo.ipv6 || undefined,
              wlanUserMac: latestInfo.mac || undefined,
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
  }, [addLog, config.accounts, config.wifiList, currentAccount, networkInfo, refreshNetworkInfo]);

  // 登出
  const logout = useCallback(async () => {
    if (!servicesRef.current) {
      addLog('error', '服务未初始化');
      return;
    }

    addLog('info', '正在登出...');

    try {
      const { authService } = servicesRef.current;
      // 注销请求不依赖本机 IP（与参考实现一致），IP 仅用于日志
      const result = await authService.logout(networkInfo.ipv4 || undefined);

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

  // 自动认证：前台检查 + 配置同步给原生后台引擎
  const markAuthenticated = useCallback(() => {
    setNetworkStatus('connected');
  }, []);
  useAutoAuth({
    servicesRef,
    config,
    accounts,
    currentAccount,
    ready: servicesReady,
    addLog,
    onAuthenticated: markAuthenticated,
  });

  // 自动更新：配置加载完成后检查一次（12 小时内只查一次）
  const autoUpdateEnabled = config.settings.autoUpdate;
  useEffect(() => {
    if (!servicesReady || !autoUpdateEnabled) return;
    autoCheckForUpdate()
      .then(release => {
        if (release) {
          addLog('info', `发现新版本 ${release.version}`);
        }
      })
      .catch(() => undefined);
  }, [servicesReady, autoUpdateEnabled, addLog]);

  // 权限引导：首次启动与开启自动重连时逐项申请；定位授予后立即刷新 SSID
  const handleLocationGranted = useCallback(() => {
    setHasPermission(true);
    refreshNetworkInfo().catch(() => undefined);
  }, [refreshNetworkInfo]);
  const permissionGuide = usePermissionGuide({
    ready: servicesReady,
    autoAuthEnabled: config.settings.autoReconnect,
    addLog,
    onLocationGranted: handleLocationGranted,
  });

  // 账户管理
  const { addAccount, updateAccount, removeAccount, switchAccount } = useAccountActions({
    servicesRef,
    accounts,
    currentAccount,
    setAccounts,
    setCurrentAccount,
    addLog,
    syncConfigState,
  });
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
        permissionItems: permissionGuide.items,
        requestAppPermission: permissionGuide.request,
        runPermissionGuide: permissionGuide.runGuide,
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
