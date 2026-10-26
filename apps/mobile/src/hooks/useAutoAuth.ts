/**
 * 前台自动认证 Hook（方案 A）
 *
 * 应用在前台时，按心跳间隔、WiFi 变化事件与回到前台三种时机检查一次：
 * 当前 WiFi 需要认证 且 探测不到 204 时自动登录（对齐参考实现 tust-portal-desktop background.rs）。
 *
 * - Android 有原生 AutoAuthModule 时，检查交给原生串行引擎（请求绑定 WiFi，与后台服务共用、不会重复登录）
 * - 原生模块不可用时（如 iOS），退回 JS 实现，判定逻辑与桌面端 AutoReconnectService 一致
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AccountConfig, AppConfig } from '@repo/shared';
import type { MobileServices } from '../context/mobileServices';
import { getNetworkInfo, onWifiChanged, startWatching, stopWatching } from '../native/WifiModule';
import {
  buildAutoAuthProfile,
  checkAutoAuthNow,
  getLastAutoAuthResult,
  isAutoAuthAvailable,
  onAutoAuthResult,
  syncAutoAuthProfile,
  type AutoAuthResult,
} from '../native/AutoAuth';

type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface UseAutoAuthOptions {
  servicesRef: React.MutableRefObject<MobileServices | null>;
  /** 配置/账号变化时重新同步给原生层 */
  config: AppConfig;
  accounts: AccountConfig[];
  currentAccount: AccountConfig | null;
  /** 服务与配置加载完成后才开始检查 */
  ready: boolean;
  addLog: (level: LogLevel, message: string) => void;
  onAuthenticated?: () => void;
}

/** WiFi 事件合并窗口：连上时会连续触发多次事件，且 DHCP/门户需要片刻就绪 */
const WIFI_EVENT_DEBOUNCE_MS = 3000;
const MIN_INTERVAL_MS = 15_000;
/** JS 退回实现的冷却：成功/首次 30 秒，连续失败指数退避至 15 分钟（与原生引擎一致） */
const JS_MIN_LOGIN_INTERVAL_MS = 30_000;
const JS_BASE_FAILURE_BACKOFF_MS = 60_000;
const JS_MAX_FAILURE_BACKOFF_MS = 15 * 60_000;

export function describeAutoAuthResult(result: AutoAuthResult): string {
  const who = result.username ? `（${result.username}）` : '';
  return result.success
    ? `自动认证成功${who}: ${result.message}`
    : `自动认证失败${who}: ${result.message}`;
}

export function useAutoAuth({
  servicesRef,
  config,
  accounts,
  currentAccount,
  ready,
  addLog,
  onAuthenticated,
}: UseAutoAuthOptions): void {
  const nativeAvailable = isAutoAuthAvailable();
  const enabled = config.settings.autoReconnect;
  const intervalMs = Math.max(config.settings.heartbeatIntervalSeconds * 1000, MIN_INTERVAL_MS);

  // 回调放进 ref，避免每次渲染重建定时器与订阅
  const addLogRef = useRef(addLog);
  const onAuthenticatedRef = useRef(onAuthenticated);
  addLogRef.current = addLog;
  onAuthenticatedRef.current = onAuthenticated;

  const inFlightRef = useRef(false);
  const jsStateRef = useRef({ lastLoginAt: 0, failures: 0 });

  // 1. 配置同步给原生层（后台服务与 WorkManager 依赖这份快照）
  useEffect(() => {
    if (!ready || !nativeAvailable) return;
    const latest = servicesRef.current?.configManager.getConfig() ?? config;
    syncAutoAuthProfile(buildAutoAuthProfile(latest)).catch(error => {
      addLogRef.current(
        'warn',
        `同步自动认证配置失败: ${error instanceof Error ? error.message : String(error)}`
      );
    });
    jsStateRef.current = { lastLoginAt: 0, failures: 0 };
  }, [ready, nativeAvailable, config, accounts, currentAccount, servicesRef]);

  // 2. 原生结果（含后台服务、WorkManager 产生的）写入日志
  useEffect(() => {
    if (!nativeAvailable) return;
    const subscription = onAutoAuthResult(result => {
      addLogRef.current(result.success ? 'success' : 'warn', describeAutoAuthResult(result));
      if (result.success) onAuthenticatedRef.current?.();
    });
    return () => subscription?.remove();
  }, [nativeAvailable]);

  // 启动时补出应用未运行期间的最近一次后台认证结果
  useEffect(() => {
    if (!ready || !nativeAvailable) return;
    getLastAutoAuthResult().then(result => {
      if (result) {
        const time = new Date(result.timestamp).toLocaleTimeString();
        addLogRef.current(
          'info',
          `最近一次后台认证（${time}）: ${result.success ? '成功' : '失败'} - ${result.message}`
        );
      }
    });
  }, [ready, nativeAvailable]);

  // 3. 前台检查时机：定时 + WiFi 事件 + 回到前台
  useEffect(() => {
    if (!ready || !enabled) return;

    const runJsCheck = async (): Promise<void> => {
      const services = servicesRef.current;
      if (!services) return;

      const info = await getNetworkInfo();
      if (!info.connected || !info.ipv4) return;

      const requirement = services.wifiManager.resolveAuthRequirement(info.ssid, info.ipv4);
      if (!requirement.requiresAuth) return;

      const linked =
        (info.ssid ? services.wifiManager.getWifiBySsid(info.ssid)?.linkedAccountIds : undefined)
          ?.map(id => services.accountManager.getAccountById(id))
          .filter((account): account is AccountConfig => account !== null) ?? [];
      const current = services.accountManager.getCurrentAccount();
      const loginAccounts = linked.length > 0 ? linked : current ? [current] : [];
      if (loginAccounts.length === 0) return;

      if (await services.networkDetector.checkConnectivity()) {
        jsStateRef.current.failures = 0;
        return;
      }

      const state = jsStateRef.current;
      const cooldown =
        state.failures === 0
          ? JS_MIN_LOGIN_INTERVAL_MS
          : Math.min(
              JS_BASE_FAILURE_BACKOFF_MS * 2 ** Math.min(state.failures - 1, 4),
              JS_MAX_FAILURE_BACKOFF_MS
            );
      if (Date.now() - state.lastLoginAt < cooldown) return;
      state.lastLoginAt = Date.now();

      addLogRef.current('info', '检测到需要校园网认证，开始自动登录');
      const result = await services.authService.loginWithAccounts(loginAccounts, {
        wlanUserIp: info.ipv4,
        wlanUserIpv6: info.ipv6 || undefined,
      });
      if (result.success) {
        state.failures = 0;
        addLogRef.current('success', `自动认证成功: ${result.message}`);
        onAuthenticatedRef.current?.();
      } else {
        state.failures += 1;
        addLogRef.current('warn', `自动认证失败: ${result.message}`);
      }
    };

    // 内部已捕获全部异常，调用方可直接 fire-and-forget
    const check = async (trigger: string): Promise<void> => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        if (nativeAvailable) {
          // 结果通过 netmate:autoAuthResult 事件写日志，这里不重复记录
          await checkAutoAuthNow(trigger);
        } else {
          await runJsCheck();
        }
      } catch (error) {
        addLogRef.current(
          'warn',
          `自动认证检查异常: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        inFlightRef.current = false;
      }
    };

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let intervalTimer: ReturnType<typeof setInterval> | null = null;

    const startInterval = () => {
      if (!intervalTimer) {
        intervalTimer = setInterval(() => check('foreground'), intervalMs);
      }
    };
    const stopInterval = () => {
      if (intervalTimer) {
        clearInterval(intervalTimer);
        intervalTimer = null;
      }
    };

    startWatching().catch(() => undefined);
    const wifiSubscription = onWifiChanged(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => check('wifi'), WIFI_EVENT_DEBOUNCE_MS);
    });

    // 后台由原生服务负责；JS 定时器只在前台运行，避免后台唤醒
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        check('foreground');
        startInterval();
      } else {
        stopInterval();
      }
    });

    check('foreground');
    startInterval();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      stopInterval();
      wifiSubscription?.remove();
      appStateSubscription.remove();
      stopWatching().catch(() => undefined);
    };
  }, [ready, enabled, intervalMs, nativeAvailable, servicesRef]);
}

export default useAutoAuth;
