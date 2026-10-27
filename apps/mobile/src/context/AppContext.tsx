import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  createDefaultAppConfig,
  resolveLoginAccounts,
  redactText,
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
  startWatching,
  stopWatching,
  onWifiChanged,
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
import {
  isAutoAuthAvailable,
  buildAutoAuthProfile,
  syncAutoAuthProfile,
  nativeLogin,
  nativeLogout,
  getAuthSnapshot,
  onAuthSnapshot,
  onWifiReconnectProgress,
  getReconnectProgress,
  type AuthSnapshot,
  type WifiReconnectProgress,
} from '../native/AutoAuth';
import {
  appendPersistentLog,
  queryPersistentLogs,
  onPersistentLog,
  clearPersistentLogs,
  exportPersistentLogs,
  type PersistentLogEntry,
} from '../native/Logs';
import type { PermissionItem, PermissionKey } from '../native/Permissions';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: PersistentLogEntry['level'];
  message: string;
}
export type ConfigUpdate = AppConfig | ((current: AppConfig) => AppConfig);
interface AppContextType {
  config: AppConfig;
  setConfig: (update: ConfigUpdate) => Promise<void>;
  configurationState: 'loading' | 'saving' | 'syncing' | 'saved' | 'error';
  configurationError: string | null;
  retryConfigurationSync: () => Promise<void>;
  networkStatus: 'connected' | 'disconnected' | 'connecting';
  networkInfo: NetworkInfo;
  authSnapshot: AuthSnapshot | null;
  reconnectProgress: WifiReconnectProgress | null;
  ipAddress: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  resumeAutoAuth: () => Promise<void>;
  accounts: AccountConfig[];
  currentAccount: AccountConfig | null;
  addAccount: (account: Omit<AccountConfig, 'id'>) => Promise<AccountConfig>;
  updateAccount: (id: string, updates: Partial<AccountConfig>) => Promise<AccountConfig>;
  removeAccount: (id: string) => Promise<void>;
  switchAccount: (id: string) => Promise<void>;
  logs: LogEntry[];
  addLog: (level: LogEntry['level'], message: string) => void;
  clearLogs: () => void;
  exportLogs: () => Promise<void>;
  loadMoreLogs: () => Promise<void>;
  hasPermission: boolean;
  requestPermission: () => Promise<boolean>;
  isModuleAvailable: boolean;
  permissionItems: PermissionItem[];
  requestAppPermission: (key: PermissionKey) => Promise<void>;
  runPermissionGuide: () => Promise<void>;
  refreshNetworkInfo: () => Promise<NetworkInfo | null>;
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
const emptyNetwork: NetworkInfo = {
  wifiEnabled: false,
  connected: false,
  ssid: null,
  ipv4: null,
  ipv6: null,
  mac: null,
};
const displayLog = (entry: PersistentLogEntry): LogEntry => ({
  ...entry,
  message: redactText(entry.message),
  timestamp: new Date(entry.timestamp).toLocaleString(),
});

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const servicesRef = useRef<AppContextType['services']>(null);
  const [config, setConfigState] = useState(createDefaultAppConfig);
  const configRef = useRef(config);
  const commitQueue = useRef<Promise<unknown>>(Promise.resolve());
  const pendingRetry = useRef<(() => Promise<unknown>) | null>(null);
  const syncQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [configurationState, setConfigurationState] =
    useState<AppContextType['configurationState']>('loading');
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [networkStatus, setNetworkStatus] =
    useState<AppContextType['networkStatus']>('disconnected');
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>(emptyNetwork);
  const networkRef = useRef(networkInfo);
  const networkRequest = useRef(0);
  const [authSnapshot, setAuthSnapshot] = useState<AuthSnapshot | null>(null);
  const [reconnectProgress, setReconnectProgress] = useState<WifiReconnectProgress | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<AccountConfig[]>([]);
  const [currentAccount, setCurrentAccount] = useState<AccountConfig | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const mounted = useRef(true);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isModuleAvailable = isNativeModuleAvailable();

  const receiveLog = useCallback((entry: PersistentLogEntry) => {
    if (!mounted.current) return;
    const value = displayLog(entry);
    setLogs(previous => [value, ...previous.filter(log => log.id !== value.id)].slice(0, 500));
  }, []);
  const addLog = useCallback(
    (level: LogEntry['level'], message: string) => {
      const entry: PersistentLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        level,
        message: redactText(message),
        source: 'app',
      };
      receiveLog(entry);
      appendPersistentLog(entry).catch(() => undefined);
    },
    [receiveLog]
  );
  const clearLogs = useCallback(() => {
    setLogs([]);
    clearPersistentLogs().catch(() => addLog('error', '日志清空失败，请重试'));
  }, [addLog]);
  const loadMoreLogs = useCallback(async () => {
    const entries = await queryPersistentLogs(null, 500, logs.length);
    setLogs(previous => {
      const ids = new Set(previous.map(log => log.id));
      return [...previous, ...entries.filter(entry => !ids.has(entry.id)).map(displayLog)];
    });
  }, [logs.length]);
  const applyConfigState = useCallback((next: AppConfig) => {
    if ((next.revision ?? 0) < (configRef.current.revision ?? 0)) return;
    configRef.current = next;
    setConfigState(next);
    setAccounts(next.accounts);
    setCurrentAccount(next.accounts.find(account => account.id === next.currentAccountId) ?? null);
  }, []);
  const syncConfiguration = useCallback(
    (snapshot: AppConfig): Promise<void> => {
      const operation = syncQueue.current
        .then(async () => {
          if (!mounted.current) return;
          setConfigurationState('syncing');
          if (isAutoAuthAvailable() && !(await syncAutoAuthProfile(buildAutoAuthProfile(snapshot))))
            throw new Error('后台未确认配置，请重试同步');
          if (!mounted.current) return;
          applyConfigState(snapshot);
          setReady(true);
          setConfigurationState('saved');
          setConfigurationError(null);
        })
        .catch(error => {
          if (mounted.current) {
            setConfigurationState('error');
            setConfigurationError(error instanceof Error ? error.message : '配置同步失败');
          }
          throw error;
        });
      syncQueue.current = operation.catch(() => undefined);
      return operation;
    },
    [applyConfigState]
  );
  const retryConfigurationSync = useCallback(async () => {
    const retry = pendingRetry.current;
    if (retry) await retry();
    else {
      const latest = servicesRef.current?.configManager.getConfig();
      if (latest) await syncConfiguration(latest);
    }
  }, [syncConfiguration]);
  useEffect(() => {
    if (configurationState !== 'error') return;
    retryTimer.current = setTimeout(() => {
      retryConfigurationSync().catch(() => undefined);
    }, 5000);
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [configurationState, configurationError, retryConfigurationSync]);

  const commitAction = useCallback(
    <T,>(action: () => Promise<T>): Promise<T> => {
      const run = async (): Promise<T> => {
        let persisted = false;
        let value: T;
        try {
          setConfigurationState('saving');
          value = await action();
          persisted = true;
          const snapshot = servicesRef.current?.configManager.getConfig();
          if (!snapshot) throw new Error('服务未初始化');
          pendingRetry.current = () => syncConfiguration(snapshot);
          await syncConfiguration(snapshot);
          pendingRetry.current = null;
          return value;
        } catch (error) {
          if (!persisted) pendingRetry.current = () => commitAction(action);
          setConfigurationState('error');
          setConfigurationError(error instanceof Error ? error.message : '保存配置失败');
          addLog('error', '配置未生效，请重试保存或同步');
          throw error;
        }
      };
      const operation = commitQueue.current.then(run);
      commitQueue.current = operation.catch(() => undefined);
      return operation;
    },
    [addLog, syncConfiguration]
  );
  const setConfig = useCallback(
    (update: ConfigUpdate): Promise<void> =>
      commitAction(async () => {
        const manager = servicesRef.current?.configManager;
        if (!manager) throw new Error('服务未初始化');
        await manager.update(current => (typeof update === 'function' ? update(current) : update));
      }),
    [commitAction]
  );
  const syncConfigState = useCallback(async () => {
    const latest = servicesRef.current?.configManager.getConfig();
    if (latest) await syncConfiguration(latest);
  }, [syncConfiguration]);
  const applyAuthSnapshot = useCallback((snapshot: AuthSnapshot) => {
    if (
      snapshot.networkKey &&
      networkRef.current.networkKey &&
      snapshot.networkKey !== networkRef.current.networkKey
    )
      return;
    setAuthSnapshot(snapshot);
    setNetworkStatus(
      snapshot.authenticating
        ? 'connecting'
        : snapshot.wifiConnected &&
            (snapshot.requiresAuth ? snapshot.authenticated : snapshot.internetReachable)
          ? 'connected'
          : 'disconnected'
    );
  }, []);
  const refreshNetworkInfo = useCallback(async (): Promise<NetworkInfo | null> => {
    if (!isModuleAvailable) return null;
    const request = ++networkRequest.current;
    try {
      const info = await getNetworkInfo();
      const snapshot = isAutoAuthAvailable() ? await getAuthSnapshot() : null;
      if (!mounted.current || request !== networkRequest.current) return null;
      const changed =
        networkRef.current.networkKey !== info.networkKey ||
        networkRef.current.ssid !== info.ssid ||
        networkRef.current.ipv4 !== info.ipv4;
      networkRef.current = info;
      setNetworkInfo(info);
      if (snapshot) applyAuthSnapshot(snapshot);
      else if (!info.connected || changed) setNetworkStatus('disconnected');
      return info;
    } catch {
      addLog('warn', '网络信息刷新失败，请检查权限');
      return null;
    }
  }, [addLog, applyAuthSnapshot, isModuleAvailable]);

  useEffect(() => {
    mounted.current = true;
    let unsubscribe: (() => void) | undefined;
    const subscription = onPersistentLog(receiveLog);
    (async () => {
      try {
        const history = await queryPersistentLogs();
        if (mounted.current)
          setLogs(previous => [
            ...previous,
            ...history.filter(entry => !previous.some(log => log.id === entry.id)).map(displayLog),
          ]);
        const services = createMobileServices();
        servicesRef.current = services;
        unsubscribe = services.logger.addListener(entry =>
          addLog(
            entry.level,
            entry.data ? `${entry.message} ${JSON.stringify(entry.data)}` : entry.message
          )
        );
        await services.configManager.load();
        const native = isAutoAuthAvailable() ? await getAuthSnapshot() : null;
        const loaded = services.configManager.getConfig()!;
        if (
          native &&
          (native.revision > (loaded.revision ?? 0) ||
            (native.revision === (loaded.revision ?? 0) &&
              native.paused !== loaded.settings.autoAuthPaused))
        ) {
          await services.configManager.update(current => ({
            revision: native.revision,
            settings: { ...current.settings, autoAuthPaused: native.paused },
          }));
        }
        await syncConfiguration(services.configManager.getConfig()!);
        if (!mounted.current) return;
        setReady(true);
        setHasPermission(await hasLocationPermission());
        await refreshNetworkInfo();
        addLog('success', '配置加载完成');
      } catch (error) {
        addLog('error', `初始化失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    })();
    return () => {
      mounted.current = false;
      unsubscribe?.();
      subscription?.remove();
      servicesRef.current?.logger.stopAutoCleanup();
      servicesRef.current = null;
    };
  }, [addLog, receiveLog, refreshNetworkInfo, syncConfiguration]);

  useEffect(() => {
    if (!ready || !isModuleAvailable) return;
    startWatching().catch(() => undefined);
    const wifi = onWifiChanged(() => {
      refreshNetworkInfo();
    });
    const nativeState = onAuthSnapshot(snapshot => {
      if (snapshot.networkKey !== networkRef.current.networkKey) {
        refreshNetworkInfo();
      } else applyAuthSnapshot(snapshot);
    });
    const progress = onWifiReconnectProgress(setReconnectProgress);
    getReconnectProgress().then(value => {
      if (value) setReconnectProgress(value);
    });
    const appState = AppState.addEventListener('change', value => {
      if (value === 'active') refreshNetworkInfo();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') refreshNetworkInfo();
    }, 30000);
    return () => {
      wifi?.remove();
      nativeState?.remove();
      progress?.remove();
      appState.remove();
      clearInterval(timer);
      stopWatching().catch(() => undefined);
    };
  }, [ready, isModuleAvailable, refreshNetworkInfo, applyAuthSnapshot]);

  useEffect(() => {
    if (ready && isAutoStartAvailable())
      setAutoStartEnabled(config.settings.autoLaunch).catch(() => undefined);
  }, [ready, config.settings.autoLaunch]);
  useEffect(() => {
    if (!ready || !isBackgroundServiceAvailable()) return;
    (async () => {
      const shouldRun = config.settings.enableHeartbeat || config.settings.autoReconnect;
      if (shouldRun) await startBackgroundService(config.settings.heartbeatIntervalSeconds * 1000);
      else if (await isBackgroundServiceRunning()) await stopBackgroundService();
    })().catch(() => addLog('warn', '后台服务更新失败'));
  }, [
    ready,
    config.settings.autoReconnect,
    config.settings.enableHeartbeat,
    config.settings.heartbeatIntervalSeconds,
    addLog,
  ]);

  const resumeAutoAuth = useCallback(async () => {
    await setConfig(current => ({
      ...current,
      settings: { ...current.settings, autoAuthPaused: false },
    }));
  }, [setConfig]);
  const login = useCallback(async () => {
    const services = servicesRef.current;
    if (!services) {
      addLog('error', '服务未初始化');
      return;
    }
    try {
      await resumeAutoAuth();
      const info = (await refreshNetworkInfo()) ?? networkRef.current;
      if (!info.ipv4 || !info.connected) {
        addLog('error', '无法获取 IP 地址，请检查 WiFi 连接');
        return;
      }
      setNetworkStatus('connecting');
      const selected = resolveLoginAccounts(services.configManager.getConfig()!, info.ssid);
      if (!selected.length) {
        setNetworkStatus('disconnected');
        addLog('error', '请先选择账户');
        return;
      }
      const result = isAutoAuthAvailable()
        ? await nativeLogin()
        : await services.authService.runExclusive(() =>
            services.authService.loginWithAccounts(
              selected,
              {
                wlanUserIp: info.ipv4!,
                wlanUserIpv6: info.ipv6 || undefined,
              },
              { retrySingle: true }
            )
          );
      if (!result) throw new Error('认证引擎未返回结果');
      if (
        networkRef.current.networkKey !== info.networkKey ||
        networkRef.current.ssid !== info.ssid
      )
        return;
      setNetworkStatus(result.success ? 'connected' : 'disconnected');
      addLog(result.success ? 'success' : 'warn', result.message);
    } catch (error) {
      setNetworkStatus('disconnected');
      addLog('error', `登录失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [addLog, refreshNetworkInfo, resumeAutoAuth]);
  const logout = useCallback(async () => {
    const services = servicesRef.current;
    if (!services) return;
    try {
      await setConfig(current => ({
        ...current,
        settings: { ...current.settings, autoAuthPaused: true },
      })).catch(() => addLog('warn', '配置同步待重试，先暂停原生认证'));
      const result = isAutoAuthAvailable()
        ? await nativeLogout()
        : await services.authService.runExclusive(() =>
            services.authService.logout(networkRef.current.ipv4 || undefined)
          );
      if (result?.success) setNetworkStatus('disconnected');
      addLog(result?.success ? 'success' : 'warn', result?.message ?? '注销失败，自动认证保持暂停');
    } catch (error) {
      addLog('error', `注销失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [addLog, setConfig]);
  const requestPermission = useCallback(async () => {
    const granted = await requestLocationPermission();
    setHasPermission(granted);
    if (granted) await refreshNetworkInfo();
    return granted;
  }, [refreshNetworkInfo]);
  const onAuthenticated = useCallback(() => {
    if (isAutoAuthAvailable()) refreshNetworkInfo();
    else setNetworkStatus('connected');
  }, [refreshNetworkInfo]);
  useAutoAuth({
    servicesRef,
    config,
    accounts,
    currentAccount,
    ready,
    addLog,
    onAuthenticated,
    syncManagedExternally: true,
  });
  useEffect(() => {
    if (ready && config.settings.autoUpdate) autoCheckForUpdate().catch(() => undefined);
  }, [ready, config.settings.autoUpdate]);
  const onLocationGranted = useCallback(() => {
    setHasPermission(true);
    refreshNetworkInfo();
  }, [refreshNetworkInfo]);
  const permissions = usePermissionGuide({
    ready,
    autoAuthEnabled: config.settings.autoReconnect,
    addLog,
    onLocationGranted,
  });
  const accountActions = useAccountActions({
    servicesRef,
    accounts,
    currentAccount,
    setAccounts,
    setCurrentAccount,
    addLog,
    syncConfigState,
    commitAction,
  });

  return (
    <AppContext.Provider
      value={{
        config,
        setConfig,
        configurationState,
        configurationError,
        retryConfigurationSync,
        networkStatus,
        networkInfo,
        authSnapshot,
        reconnectProgress,
        ipAddress: networkInfo.ipv4 || '0.0.0.0',
        login,
        logout,
        resumeAutoAuth,
        accounts,
        currentAccount,
        ...accountActions,
        logs,
        addLog,
        clearLogs,
        exportLogs: exportPersistentLogs,
        loadMoreLogs,
        hasPermission,
        requestPermission,
        isModuleAvailable,
        refreshNetworkInfo,
        permissionItems: permissions.items,
        requestAppPermission: permissions.request,
        runPermissionGuide: permissions.runGuide,
        services: servicesRef.current,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
