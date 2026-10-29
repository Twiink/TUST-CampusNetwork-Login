import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { matchesLog, mergeLogs, redact, type LogHistoryFilter } from '@repo/shared';
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
import { normalizeMobileWifiRules } from '../services/wifiPolicy';
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
  queryPersistentLogPage,
  onPersistentLog,
  clearPersistentLogs,
  exportPersistentLogs,
  type PersistentLogEntry,
} from '../native/Logs';
import type { PermissionItem, PermissionKey } from '../native/Permissions';

export type LogEntry = PersistentLogEntry;
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
  clearLogs: () => Promise<void>;
  logError: string | null;
  logsLoading: boolean;
  logsTotal: number;
  hasMoreLogs: boolean;
  queryLogs: (filter?: LogHistoryFilter) => Promise<void>;
  refreshLogs: () => Promise<void>;
  exportLogs: (format?: 'text' | 'json', filter?: LogHistoryFilter) => Promise<void>;
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
  data: redact(entry.data),
});

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const servicesRef = useRef<AppContextType['services']>(null);
  const [config, setConfigState] = useState(createDefaultAppConfig);
  const configRef = useRef(config);
  const commitQueue = useRef<Promise<unknown>>(Promise.resolve());
  const pendingRetry = useRef<(() => Promise<unknown>) | null>(null);
  const initializationFailed = useRef(false);
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
  const [logError, setLogError] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsTotal, setLogsTotal] = useState(0);
  const [hasMoreLogs, setHasMoreLogs] = useState(true);
  const logFilter = useRef<LogHistoryFilter>({});
  const logsRef = useRef(logs);
  logsRef.current = logs;
  const logEpoch = useRef(0);
  const logWrites = useRef<Promise<void>>(Promise.resolve());
  const pendingLocalLogs = useRef(new Map<string, PersistentLogEntry>());
  const queryLogEvents = useRef<Map<string, LogEntry> | null>(null);
  const logClearPending = useRef<Promise<void> | null>(null);
  const logGeneration = useRef<string | undefined>(undefined);
  const pendingNativeLogs = useRef<PersistentLogEntry[]>([]);
  const logCursor = useRef<string | null>(null);
  const logHasMore = useRef(true);
  const logPagePending = useRef(false);
  const mounted = useRef(true);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isModuleAvailable = isNativeModuleAvailable();

  const receiveLog = useCallback((entry: PersistentLogEntry) => {
    if (!mounted.current) return;
    if (entry.generation && logClearPending.current) {
      pendingNativeLogs.current.push(entry);
      return;
    }
    if (entry.generation && logGeneration.current && entry.generation !== logGeneration.current)
      return;
    const value = displayLog(entry);
    if (matchesLog(value, logFilter.current)) {
      queryLogEvents.current?.set(value.id, value);
      setLogs(previous => mergeLogs(previous, [value]));
    }
  }, []);
  const persistLog = useCallback(
    (entry: PersistentLogEntry) => {
      pendingLocalLogs.current.set(entry.id, entry);
      receiveLog(entry);
      logWrites.current = logWrites.current
        .then(async () => {
          await appendPersistentLog(entry);
          pendingLocalLogs.current.delete(entry.id);
        })
        .catch(() => setLogError('日志保存失败，当前记录仍可查看，请检查存储空间'));
    },
    [receiveLog]
  );
  const addLog = useCallback(
    (level: LogEntry['level'], message: string) =>
      persistLog({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: Date.now(),
        level,
        message: redactText(message),
        source: 'app',
      }),
    [persistLog]
  );
  const clearLogs = useCallback(async () => {
    logEpoch.current++;
    queryLogEvents.current = null;
    logPagePending.current = false;
    const previousIds = new Set(logsRef.current.map(entry => entry.id));
    logCursor.current = null;
    logHasMore.current = true;
    const pending = logWrites.current.then(async () => {
      logGeneration.current = await clearPersistentLogs();
      previousIds.forEach(id => pendingLocalLogs.current.delete(id));
      setLogs(previous =>
        previous.filter(
          entry =>
            !previousIds.has(entry.id) && !entry.generation && matchesLog(entry, logFilter.current)
        )
      );
      setLogsTotal(0);
      setHasMoreLogs(false);
      setLogError(null);
    });
    logWrites.current = pending.catch(() => undefined);
    logClearPending.current = pending;
    try {
      await pending;
    } catch (error) {
      setLogError('日志清空失败，请重试');
      throw error;
    } finally {
      if (logClearPending.current === pending) {
        logClearPending.current = null;
        const queued = pendingNativeLogs.current;
        pendingNativeLogs.current = [];
        queued.forEach(receiveLog);
      }
    }
  }, [receiveLog]);
  const readLogs = useCallback(
    async (mode: 'query' | 'refresh' | 'more', filter?: LogHistoryFilter) => {
      if (mode === 'more' && (logPagePending.current || !logHasMore.current)) return;
      if (mode === 'query') {
        logEpoch.current++;
        logFilter.current = filter ?? {};
        queryLogEvents.current = new Map();
      }
      const epoch = logEpoch.current;
      logPagePending.current = true;
      setLogsLoading(true);
      try {
        await logClearPending.current;
        await logWrites.current;
        if (epoch !== logEpoch.current) return;
        const page = await queryPersistentLogPage(
          mode === 'more' ? logCursor.current : null,
          logFilter.current
        );
        if (!mounted.current || epoch !== logEpoch.current) return;
        if (mode === 'refresh' && logsRef.current.length) {
          const knownIds = new Set(logsRef.current.map(entry => entry.id));
          let chunk = page;
          while (chunk.hasMore && !chunk.entries.some(entry => knownIds.has(entry.id))) {
            chunk = await queryPersistentLogPage(chunk.nextCursor, logFilter.current);
            if (epoch !== logEpoch.current) return;
            page.entries.push(...chunk.entries);
          }
          page.nextCursor = chunk.nextCursor;
          page.hasMore = chunk.hasMore;
        }
        if (mode !== 'refresh' || logCursor.current === null) {
          logCursor.current = page.nextCursor;
          logHasMore.current = page.hasMore;
          setHasMoreLogs(page.hasMore);
        }
        setLogsTotal(page.total);
        setLogError(page.error ?? null);
        const received = mode === 'query' ? [...(queryLogEvents.current?.values() ?? [])] : [];
        if (mode === 'query') queryLogEvents.current = null;
        setLogs(previous =>
          mergeLogs(
            mode === 'query' ? [] : previous,
            [...pendingLocalLogs.current.values()]
              .map(displayLog)
              .filter(entry => matchesLog(entry, logFilter.current)),
            page.entries.map(displayLog),
            received
          )
        );
      } catch (error) {
        setLogError('历史日志读取失败，请刷新重试');
        throw error;
      } finally {
        if (epoch === logEpoch.current) {
          if (mode === 'query') queryLogEvents.current = null;
          logPagePending.current = false;
          setLogsLoading(false);
        }
      }
    },
    []
  );
  const loadMoreLogs = useCallback(() => readLogs('more'), [readLogs]);
  const queryLogs = useCallback(
    (filter?: LogHistoryFilter) => readLogs('query', filter),
    [readLogs]
  );
  const refreshLogs = useCallback(() => readLogs('refresh'), [readLogs]);
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
    if (configurationState !== 'error' || initializationFailed.current) return;
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
        await manager.update(current => {
          const next = typeof update === 'function' ? update(current) : update;
          return {
            ...next,
            wifiList: normalizeMobileWifiRules(next.wifiList),
            settings: {
              ...next.settings,
              heartbeatIntervalSeconds: Math.max(
                15,
                Math.min(300, next.settings.heartbeatIntervalSeconds)
              ),
            },
          };
        });
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
        : snapshot.wifiConnected && snapshot.internetReachable
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
    const initialize = async (): Promise<void> => {
      let retryInitialization: () => Promise<void> = initialize;
      initializationFailed.current = false;
      setConfigurationState('loading');
      setConfigurationError(null);
      try {
        let services = servicesRef.current;
        if (!services) {
          services = createMobileServices();
          servicesRef.current = services;
          unsubscribe = services.logger.addListener(entry =>
            persistLog({ ...entry, timestamp: new Date(entry.timestamp).getTime() })
          );
        }
        await services.configManager.load();
        const rules = services.configManager.getConfig()!.wifiList;
        const normalized = normalizeMobileWifiRules(rules);
        if (normalized.some((rule, index) => rule !== rules[index]))
          await services.configManager.update({ wifiList: normalized });
        const interval = services.configManager.getSettings().heartbeatIntervalSeconds;
        if (interval < 15 || interval > 300)
          await services.configManager.updateSettings({
            heartbeatIntervalSeconds: Math.max(15, Math.min(300, interval)),
          });
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
        const snapshot = services.configManager.getConfig()!;
        const finishInitialization = async () => {
          await syncConfiguration(snapshot);
          if (!mounted.current) return;
          setHasPermission(await hasLocationPermission());
          await refreshNetworkInfo();
          initializationFailed.current = false;
          pendingRetry.current = null;
          setReady(true);
          addLog('success', '配置加载完成');
        };
        retryInitialization = finishInitialization;
        await finishInitialization();
      } catch (error) {
        if (!mounted.current) return;
        initializationFailed.current = true;
        pendingRetry.current = retryInitialization;
        setConfigurationState('error');
        setConfigurationError(error instanceof Error ? error.message : '初始化失败');
        addLog('error', `初始化失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    };
    loadMoreLogs().catch(() => addLog('warn', '历史日志读取失败，可在日志页重试'));
    initialize();
    return () => {
      mounted.current = false;
      unsubscribe?.();
      subscription?.remove();
      servicesRef.current?.logger.stopAutoCleanup();
      servicesRef.current = null;
    };
  }, [addLog, loadMoreLogs, persistLog, receiveLog, refreshNetworkInfo, syncConfiguration]);

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
      if (value === 'active') {
        refreshNetworkInfo();
        refreshLogs().catch(() => undefined);
      }
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
  }, [ready, isModuleAvailable, refreshNetworkInfo, refreshLogs, applyAuthSnapshot]);

  useEffect(() => {
    if (ready && isAutoStartAvailable())
      setAutoStartEnabled(config.settings.autoLaunch).catch(() => undefined);
  }, [ready, config.settings.autoLaunch]);
  useEffect(() => {
    if (!ready || !isBackgroundServiceAvailable()) return;
    (async () => {
      const shouldRun =
        config.settings.enableHeartbeat ||
        config.settings.autoReconnect ||
        config.settings.startupAutoConnect;
      if (shouldRun) await startBackgroundService(config.settings.heartbeatIntervalSeconds * 1000);
      else if (await isBackgroundServiceRunning()) await stopBackgroundService();
    })().catch(() => addLog('warn', '后台服务更新失败'));
  }, [
    ready,
    config.settings.autoReconnect,
    config.settings.startupAutoConnect,
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
      const snapshot = services.configManager.getConfig()!;
      const current = async () => {
        const now = await getNetworkInfo();
        return (
          services.configManager.getConfig()?.revision === snapshot.revision &&
          !services.configManager.getSettings().autoAuthPaused &&
          now.connected &&
          now.networkKey === info.networkKey &&
          now.ssid === info.ssid &&
          now.bssid === info.bssid &&
          now.ipv4 === info.ipv4
        );
      };
      const selected = resolveLoginAccounts(
        snapshot,
        info.ssid ? { ...info, ssid: info.ssid } : null
      );
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
              { retrySingle: true, shouldContinue: current }
            )
          );
      if (!result) throw new Error('认证引擎未返回结果');
      if (!(await current())) return;
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

  const exportLogs = useCallback(
    async (format: 'text' | 'json' = 'text', filter?: LogHistoryFilter) => {
      await logClearPending.current;
      await logWrites.current;
      await exportPersistentLogs(format, filter);
    },
    []
  );
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
        logError,
        logsLoading,
        logsTotal,
        hasMoreLogs,
        queryLogs,
        refreshLogs,
        exportLogs,
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
