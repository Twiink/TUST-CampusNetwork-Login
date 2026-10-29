/**
 * 权限引导 Hook
 *
 * 首次启动、以及开启「断线自动重连」时运行一次引导：按顺序逐项先弹说明对话框，
 * 用户同意后再触发系统弹窗或跳转设置页；拒绝任一项都不阻塞后续步骤和应用使用。
 * 引导已完成的标记保存在 AsyncStorage，之后只在设置页「权限状态」中手动补授。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PERMISSION_META,
  checkPermission,
  getPermissionItems,
  isPermissionGuideAvailable,
  requestPermission,
  type PermissionItem,
  type PermissionKey,
} from '../native/Permissions';

const GUIDE_DONE_KEY = 'netmate:permission-guide-done';

/** 引导顺序；后台定位依赖前台定位，必须排在其后 */
const GUIDE_ORDER: PermissionKey[] = [
  'location',
  'nearbyWifi',
  'notification',
  'battery',
  'backgroundLocation',
  'autoStart',
];

/** 跳转设置页的项需要用户手动操作，说明文案单独给出 */
const GUIDE_MESSAGES: Record<PermissionKey, string> = {
  location:
    '需要位置权限来读取当前 WiFi 名称，用于判断是否连接校园网并自动认证。应用不会记录或上传位置。',
  nearbyWifi: '需要附近设备权限来管理 WiFi 连接。授权后可提交连接建议，并在系统页面选择网络。',
  notification: '需要通知权限来显示后台自动认证的运行状态和结果。',
  battery: '为避免后台自动认证被系统省电策略停止，请在接下来的系统对话框中选择「允许」。',
  backgroundLocation:
    '可选：允许后台读取 WiFi 名称，让已配置 WiFi 的认证规则在应用后台时也能生效。\n\n接下来会打开系统设置，请在「位置信息」中选择「始终允许」。不开启也能在后台按校园网门户自动认证。',
  autoStart:
    '可选：部分国产系统会清理后台服务。接下来会打开系统的自启动/后台管理页面，请允许本应用自启动和后台运行。',
};

const CONFIRM_LABELS: Record<PermissionKey, string> = {
  location: '去授权',
  nearbyWifi: '去授权',
  notification: '去授权',
  battery: '去设置',
  backgroundLocation: '去设置',
  autoStart: '去设置',
};

function confirmStep(key: PermissionKey): Promise<boolean> {
  const meta = PERMISSION_META[key];
  return new Promise(resolve => {
    Alert.alert(
      meta.title,
      GUIDE_MESSAGES[key],
      [
        { text: meta.required ? '暂不' : '跳过', style: 'cancel', onPress: () => resolve(false) },
        { text: CONFIRM_LABELS[key], onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/** 等待应用从设置页回到前台（最多等 2 分钟，避免引导永久挂起） */
function waitForForeground() {
  let finish!: () => void;
  const promise = new Promise<void>(resolve => {
    finish = resolve;
  });
  let left = AppState.currentState !== 'active';
  const subscription = AppState.addEventListener('change', state => {
    if (state !== 'active') left = true;
    else if (left) finish();
  });
  const timer = setTimeout(finish, 120_000);
  return {
    promise,
    cancel: () => {
      clearTimeout(timer);
      subscription.remove();
      finish();
    },
  };
}

export interface UsePermissionGuideOptions {
  /** 配置加载完成后才运行，避免与初始化日志交错 */
  ready: boolean;
  /** 「断线自动重连」开关；从关到开时重新引导一次 */
  autoAuthEnabled: boolean;
  addLog: (level: 'info' | 'success' | 'warn' | 'error', message: string) => void;
  /** 定位权限变化后刷新网络信息（SSID 需要定位权限） */
  onLocationGranted?: () => void;
}

export interface UsePermissionGuideResult {
  items: PermissionItem[];
  refresh: () => Promise<void>;
  /** 设置页手动申请单项 */
  request: (key: PermissionKey) => Promise<void>;
  /** 手动重新运行完整引导 */
  runGuide: () => Promise<void>;
}

export function usePermissionGuide({
  ready,
  autoAuthEnabled,
  addLog,
  onLocationGranted,
}: UsePermissionGuideOptions): UsePermissionGuideResult {
  const [items, setItems] = useState<PermissionItem[]>([]);
  const runningRef = useRef(false);
  const addLogRef = useRef(addLog);
  const onLocationGrantedRef = useRef(onLocationGranted);
  addLogRef.current = addLog;
  onLocationGrantedRef.current = onLocationGranted;

  const refresh = useCallback(async () => {
    if (!isPermissionGuideAvailable()) return;
    setItems(await getPermissionItems());
  }, []);

  const requestOne = useCallback(async (key: PermissionKey): Promise<void> => {
    const before = await checkPermission(key);
    const foreground = waitForForeground();
    let state;
    try {
      state = await requestPermission(key);
      // 跳转设置页/系统对话框的项，回到前台后再查询真实状态
      if (state === 'unknown') {
        await foreground.promise;
        state = await checkPermission(key);
      }
    } finally {
      foreground.cancel();
    }
    if (key === 'location' && state === 'granted' && before !== 'granted') {
      onLocationGrantedRef.current?.();
    }
    if (state === 'granted' && before !== 'granted') {
      addLogRef.current('success', `${PERMISSION_META[key].title}已开启`);
    } else if (state === 'blocked') {
      addLogRef.current(
        'warn',
        `${PERMISSION_META[key].title}被拒绝，可在设置页「权限状态」中前往系统设置开启`
      );
    }
  }, []);

  const runGuide = useCallback(async () => {
    if (!isPermissionGuideAvailable() || runningRef.current) return;
    runningRef.current = true;
    try {
      for (const key of GUIDE_ORDER) {
        const state = await checkPermission(key);
        // 已授予、不适用的跳过；厂商自启动无法检测，unknown 表示设备有对应页面
        if (state === 'granted' || state === 'unsupported') continue;
        if (key === 'backgroundLocation' && (await checkPermission('location')) !== 'granted')
          continue;
        if (!(await confirmStep(key))) continue;
        await requestOne(key);
      }
      await AsyncStorage.setItem(GUIDE_DONE_KEY, '1').catch(() => undefined);
    } finally {
      runningRef.current = false;
      await refresh();
    }
  }, [refresh, requestOne]);

  const request = useCallback(
    async (key: PermissionKey) => {
      await requestOne(key);
      await refresh();
    },
    [refresh, requestOne]
  );

  // 首次启动：引导未完成时运行
  useEffect(() => {
    if (!ready || !isPermissionGuideAvailable()) return;
    let cancelled = false;
    (async () => {
      await refresh();
      const done = await AsyncStorage.getItem(GUIDE_DONE_KEY).catch(() => null);
      if (!done && !cancelled) {
        await runGuide();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, refresh, runGuide]);

  // 「断线自动重连」从关到开：重新引导（只会询问尚未授予的项）
  const prevEnabledRef = useRef(autoAuthEnabled);
  useEffect(() => {
    const wasEnabled = prevEnabledRef.current;
    prevEnabledRef.current = autoAuthEnabled;
    if (ready && autoAuthEnabled && !wasEnabled) {
      runGuide().catch(() => undefined);
    }
  }, [ready, autoAuthEnabled, runGuide]);

  // 回到前台时刷新状态（用户可能在系统设置里改过）
  useEffect(() => {
    if (!isPermissionGuideAvailable()) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refresh().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  return { items, refresh, request, runGuide };
}

export default usePermissionGuide;
