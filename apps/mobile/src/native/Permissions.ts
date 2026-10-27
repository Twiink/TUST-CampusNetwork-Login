/**
 * 权限引导 TypeScript 桥接（仅 Android）
 *
 * 自动认证依赖的权限，按申请顺序：
 * 1. 精确定位（必需）：前台读取 SSID，判定当前 WiFi 是否需要认证
 *    Android 12+ 同时申请粗略和精确定位，仍以精确定位的授权结果为准。
 *    Android 13+ 另需「附近 WiFi 设备」权限才能管理网络连接。
 * 2. 通知（Android 13+）：后台服务通知与认证结果
 * 3. 电池优化白名单：避免后台自动认证被省电策略停止
 * 4. 后台定位（可选）：后台读取 SSID；Android 11+ 只能在系统设置页选择「始终允许」
 * 5. 厂商自启动（可选）：国产系统的后台管理，无系统 API，只能跳转设置页
 */

import { NativeModules, PermissionsAndroid, Platform, type Permission } from 'react-native';

export type PermissionKey =
  | 'location'
  | 'nearbyWifi'
  | 'notification'
  | 'battery'
  | 'backgroundLocation'
  | 'autoStart';

/** granted 已授予；denied 可再次弹窗；blocked 被永久拒绝，只能去设置页；unsupported 当前系统不需要/不支持；unknown 无法检测 */
export type PermissionState = 'granted' | 'denied' | 'blocked' | 'unsupported' | 'unknown';

export interface PermissionItem {
  key: PermissionKey;
  title: string;
  description: string;
  required: boolean;
  state: PermissionState;
}

interface PermissionModuleInterface {
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  requestIgnoreBatteryOptimizations(): Promise<boolean>;
  hasAutoStartSettings(): Promise<boolean>;
  openAutoStartSettings(): Promise<'vendor' | 'app' | 'none'>;
  openAppSettings(): Promise<boolean>;
}

function nativeModule(): PermissionModuleInterface | undefined {
  return (NativeModules as { PermissionModule?: PermissionModuleInterface }).PermissionModule;
}

const apiLevel = (): number => (typeof Platform.Version === 'number' ? Platform.Version : 0);

const P = PermissionsAndroid.PERMISSIONS;
const FINE_LOCATION = P.ACCESS_FINE_LOCATION;
// RN 类型里 POST_NOTIFICATIONS / ACCESS_BACKGROUND_LOCATION 在旧版本可能缺失，这里用字符串兜底
const POST_NOTIFICATIONS = (P.POST_NOTIFICATIONS ??
  'android.permission.POST_NOTIFICATIONS') as Permission;
const BACKGROUND_LOCATION = (P.ACCESS_BACKGROUND_LOCATION ??
  'android.permission.ACCESS_BACKGROUND_LOCATION') as Permission;
const NEARBY_WIFI = (P.NEARBY_WIFI_DEVICES ??
  'android.permission.NEARBY_WIFI_DEVICES') as Permission;

/** 被拒绝过的权限记录在内存中，用于区分「从未申请」与「永久拒绝」（PermissionsAndroid.check 只返回布尔值） */
const blockedPermissions = new Set<Permission>();

export const PERMISSION_META: Record<PermissionKey, Omit<PermissionItem, 'state'>> = {
  location: {
    key: 'location',
    title: '位置权限',
    description: '读取当前 WiFi 名称，判断是否需要校园网认证',
    required: true,
  },
  nearbyWifi: {
    key: 'nearbyWifi',
    title: '附近 WiFi 设备',
    description: 'Android 13 及以上需要此权限才能管理 WiFi 连接',
    required: true,
  },
  notification: {
    key: 'notification',
    title: '通知权限',
    description: '显示后台自动认证状态和结果',
    required: false,
  },
  battery: {
    key: 'battery',
    title: '允许后台运行',
    description: '不受电池优化限制，避免后台自动认证被系统停止',
    required: false,
  },
  backgroundLocation: {
    key: 'backgroundLocation',
    title: '后台位置权限',
    description: '应用在后台时也能读取 WiFi 名称，使 WiFi 规则在后台生效',
    required: false,
  },
  autoStart: {
    key: 'autoStart',
    title: '自启动与后台管理',
    description: '国产系统需要手动允许，否则后台服务可能被清理',
    required: false,
  },
};

export function isPermissionGuideAvailable(): boolean {
  return Platform.OS === 'android';
}

async function checkRuntime(permission: Permission, minApi: number): Promise<PermissionState> {
  if (apiLevel() < minApi) return 'unsupported';
  try {
    if (await PermissionsAndroid.check(permission)) {
      blockedPermissions.delete(permission);
      return 'granted';
    }
  } catch {
    return 'unknown';
  }
  return blockedPermissions.has(permission) ? 'blocked' : 'denied';
}

async function requestRuntime(permission: Permission, minApi: number): Promise<PermissionState> {
  if (apiLevel() < minApi) return 'unsupported';
  try {
    const result =
      permission === FINE_LOCATION && apiLevel() >= 31
        ? (await PermissionsAndroid.requestMultiple([P.ACCESS_COARSE_LOCATION, FINE_LOCATION]))[
            FINE_LOCATION
          ]
        : await PermissionsAndroid.request(permission);
    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      blockedPermissions.delete(permission);
      return 'granted';
    }
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      blockedPermissions.add(permission);
      return 'blocked';
    }
    return 'denied';
  } catch {
    return 'unknown';
  }
}

export async function checkPermission(key: PermissionKey): Promise<PermissionState> {
  if (!isPermissionGuideAvailable()) return 'unsupported';
  switch (key) {
    case 'location':
      return checkRuntime(FINE_LOCATION, 23);
    case 'nearbyWifi':
      return checkRuntime(NEARBY_WIFI, 33);
    case 'notification':
      return checkRuntime(POST_NOTIFICATIONS, 33);
    case 'backgroundLocation':
      return checkRuntime(BACKGROUND_LOCATION, 29);
    case 'battery': {
      const module = nativeModule();
      if (!module || apiLevel() < 23) return 'unsupported';
      try {
        return (await module.isIgnoringBatteryOptimizations()) ? 'granted' : 'denied';
      } catch {
        return 'unknown';
      }
    }
    case 'autoStart': {
      // 厂商设置没有查询接口，只能判断设备是否有对应页面
      const module = nativeModule();
      if (!module) return 'unsupported';
      try {
        return (await module.hasAutoStartSettings()) ? 'unknown' : 'unsupported';
      } catch {
        return 'unsupported';
      }
    }
  }
}

/**
 * 申请单项权限。
 * - 定位、通知、Android 10 的后台定位：系统弹窗
 * - Android 11+ 的后台定位、被永久拒绝的权限：跳转应用设置页
 * - 电池优化：系统「允许后台运行」对话框
 * - 自启动：跳转厂商设置页
 * 跳转设置页的项返回 unknown，调用方应在应用回到前台后重新 checkPermission。
 */
export async function requestPermission(key: PermissionKey): Promise<PermissionState> {
  if (!isPermissionGuideAvailable()) return 'unsupported';
  const module = nativeModule();

  const current = await checkPermission(key);
  if (current === 'granted' || current === 'unsupported') return current;
  if (current === 'blocked' && key !== 'battery' && key !== 'autoStart') {
    await module?.openAppSettings();
    return 'unknown';
  }

  switch (key) {
    case 'location':
      return requestRuntime(FINE_LOCATION, 23);
    case 'nearbyWifi':
      return requestRuntime(NEARBY_WIFI, 33);
    case 'notification':
      return requestRuntime(POST_NOTIFICATIONS, 33);
    case 'backgroundLocation': {
      // 后台定位必须在前台定位授予之后单独申请
      if ((await checkPermission('location')) !== 'granted') return 'denied';
      if (apiLevel() >= 30) {
        await module?.openAppSettings();
        return 'unknown';
      }
      return requestRuntime(BACKGROUND_LOCATION, 29);
    }
    case 'battery':
      await module?.requestIgnoreBatteryOptimizations();
      return 'unknown';
    case 'autoStart':
      await module?.openAutoStartSettings();
      return 'unknown';
  }
}

export async function getPermissionItems(): Promise<PermissionItem[]> {
  const keys: PermissionKey[] = [
    'location',
    'nearbyWifi',
    'notification',
    'battery',
    'backgroundLocation',
    'autoStart',
  ];
  const states = await Promise.all(keys.map(checkPermission));
  return keys.map((key, index) => ({ ...PERMISSION_META[key], state: states[index] }));
}

export default {
  isPermissionGuideAvailable,
  checkPermission,
  requestPermission,
  getPermissionItems,
  PERMISSION_META,
};
