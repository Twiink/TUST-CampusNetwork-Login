import { isIP } from 'node:net';
/**
 * 桌面端 WiFi 适配器实现
 * 支持 Windows、macOS 和 Linux
 */

import type { WifiAdapter, WifiInfo, WifiDetails, NetworkInfo } from '@repo/shared';
import { resolveMacOSWifiInfo } from './wifi-adapter/macos';
import { resolveWindowsWifiInfo } from './wifi-adapter/windows';
import { resolveLinuxWifiInfo, resolveLinuxNetworkInfo } from './wifi-adapter/linux';
import { resolveMacOSNetworkInfo, resolveWindowsNetworkInfo } from './wifi-adapter/netinfo';
import { devLog } from '../utils/dev-log';

// vitest 里 vi.mock 无法拦截 CommonJS require，这里用静态 import + 惰性包装。
import * as nativeEntry from '@repo/native';

interface NativeWifiSnapshot {
  ssid?: string | null;
  bssid?: string | null;
  rssi?: number | null;
  linkSpeed?: number | null;
  channel?: number | null;
  frequency?: number | null;
  security?: string | null;
}

type NativeModule = {
  currentWifi?: () => NativeWifiSnapshot | null;
  networkInfo?: () => NativeNetworkSnapshot | null;
  __loadError?: string;
};

interface NativeNetworkSnapshot {
  ipv4?: string | null;
  ipv6?: string | null;
  mac?: string | null;
  gateway?: string | null;
  dns?: string[] | null;
  subnetMask?: string | null;
}

let nativeModule:
  | {
      currentWifi?: () => NativeWifiSnapshot | null;
      networkInfo?: () => NativeNetworkSnapshot | null;
    }
  | null
  | undefined;

/**
 * 优先加载 Rust nl80211/CoreWLAN 原生模块；失败自动回退 TS spawn 路径。
 */
export function resetNativeWifiModuleForTests(): void {
  nativeModule = undefined;
}

function hasAnyNetworkValue(info: NetworkInfo | NativeNetworkSnapshot | null): boolean {
  return Boolean(
    info &&
    (info.ipv4 ||
      info.ipv6 ||
      info.mac ||
      info.gateway ||
      info.subnetMask ||
      (Array.isArray(info.dns) && info.dns.length > 0))
  );
}

function normalizeMac(mac?: string | null): string | undefined {
  if (!mac) return undefined;
  const normalized = mac.replace(/[:-]/g, '').toLowerCase();
  return /^[0-9a-f]{12}$/.test(normalized) && normalized !== '000000000000'
    ? normalized
    : undefined;
}

function loadNativeModule() {
  if (nativeModule !== undefined) return nativeModule;
  try {
    nativeModule = nativeEntry as unknown as NativeModule;
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

async function resolveNativeWifiInfo(): Promise<WifiInfo | null> {
  const native = loadNativeModule();
  if (!native?.currentWifi) return null;
  const snapshot = native.currentWifi();
  if (!snapshot?.ssid) return null;
  return {
    ssid: snapshot.ssid,
    bssid: snapshot.bssid || undefined,
    signalStrength:
      snapshot.rssi !== null && snapshot.rssi !== undefined
        ? Math.max(0, Math.min(100, Math.round(((snapshot.rssi + 100) / 60) * 100)))
        : 0,
    linkSpeed: snapshot.linkSpeed || 0,
    frequency: snapshot.frequency || 0,
    channel: snapshot.channel || undefined,
    security: snapshot.security || undefined,
    connected: true,
  };
}

/**
 * 桌面端 WiFi 适配器
 */
const WIFI_SNAPSHOT_TTL_MS = 1500;
const NETWORK_INTERFACE_TTL_MS = 15_000;

/**
 * 桌面端 WiFi 适配器
 */
export class DesktopWifiAdapter implements WifiAdapter {
  private platform: NodeJS.Platform;
  private snapshot: WifiInfo | null = null;
  private snapshotAt = 0;
  private snapshotPromise: Promise<WifiInfo | null> | null = null;
  private networkSnapshot: NetworkInfo | null = null;
  private networkSnapshotAt = 0;
  private networkSnapshotPromise: Promise<NetworkInfo> | null = null;
  private generation = 0;

  invalidateCache(): void {
    this.generation++;
    this.snapshotAt = 0;
    this.networkSnapshotAt = 0;
    this.snapshotPromise = null;
    this.networkSnapshotPromise = null;
  }

  constructor() {
    this.platform = process.platform;
  }

  /**
   * 获取当前连接的 WiFi 信息
   */
  async getCurrentWifi(): Promise<WifiInfo | null> {
    const now = Date.now();
    if (now - this.snapshotAt < WIFI_SNAPSHOT_TTL_MS) {
      return this.snapshot;
    }
    if (this.snapshotPromise) {
      return this.snapshotPromise;
    }

    const generation = this.generation;
    const pending = (async () => {
      try {
        switch (this.platform) {
          case 'darwin':
            return (await resolveNativeWifiInfo()) ?? (await resolveMacOSWifiInfo());
          case 'win32':
            return (await resolveNativeWifiInfo()) ?? (await resolveWindowsWifiInfo());
          case 'linux':
            return (await resolveNativeWifiInfo()) ?? (await resolveLinuxWifiInfo());
          default:
            return null;
        }
      } catch (error) {
        devLog.error('Failed to get WiFi info:', error);
        return null;
      }
    })();
    this.snapshotPromise = pending;

    try {
      const result = await pending;
      if (generation !== this.generation) return this.getCurrentWifi();
      if (
        ['ssid', 'bssid', 'security', 'connected'].some(
          (key) => this.snapshot?.[key as keyof WifiInfo] !== result?.[key as keyof WifiInfo]
        )
      ) {
        this.generation++;
        this.networkSnapshotAt = 0;
        this.networkSnapshotPromise = null;
      }
      this.snapshot = result;
      this.snapshotAt = Date.now();
      return result;
    } finally {
      if (this.snapshotPromise === pending) this.snapshotPromise = null;
    }
  }

  /**
   * 获取完整的 WiFi 详细信息
   */
  async getWifiDetails(): Promise<WifiDetails | null> {
    const generation = this.generation;
    const wifiInfo = await this.getCurrentWifi();
    if (!wifiInfo) {
      return null;
    }

    const networkInfo = await this.getNetworkInfo();
    if (generation !== this.generation) return this.getWifiDetails();

    return {
      ...wifiInfo,
      ipv4: networkInfo.ipv4,
      ipv6: networkInfo.ipv6,
      mac: networkInfo.mac,
      gateway: networkInfo.gateway,
      dns: networkInfo.dns,
      subnetMask: networkInfo.subnetMask,
    };
  }

  /**
   * 获取 WiFi 信号强度
   */
  async getSignalStrength(): Promise<number> {
    const wifi = await this.getCurrentWifi();
    return wifi?.signalStrength || 0;
  }

  /**
   * 获取 WiFi 连接速度
   */
  async getLinkSpeed(): Promise<number> {
    const wifi = await this.getCurrentWifi();
    return wifi?.linkSpeed || 0;
  }

  /**
   * 获取 WiFi 频段
   */
  async getFrequency(): Promise<number> {
    const wifi = await this.getCurrentWifi();
    return wifi?.frequency || 0;
  }

  /**
   * 获取 WiFi 信道
   */
  async getChannel(): Promise<number | null> {
    const wifi = await this.getCurrentWifi();
    return wifi?.channel || null;
  }

  /**
   * 获取 BSSID
   */
  async getBSSID(): Promise<string | null> {
    const wifi = await this.getCurrentWifi();
    return wifi?.bssid || null;
  }

  /**
   * 获取安全类型
   */
  async getSecurity(): Promise<string | null> {
    const wifi = await this.getCurrentWifi();
    return wifi?.security || null;
  }

  /**
   * 获取网络配置信息
   */
  async isWifiEnabled(): Promise<boolean> {
    return (await import('./wifi-switcher')).isWifiRadioEnabled();
  }

  async getNetworkInfo(): Promise<NetworkInfo> {
    const now = Date.now();
    if (now - this.networkSnapshotAt < NETWORK_INTERFACE_TTL_MS) {
      return this.networkSnapshot ?? {};
    }
    if (this.networkSnapshotPromise) {
      return this.networkSnapshotPromise;
    }

    const generation = this.generation;
    const pending = (async () => {
      const native = loadNativeModule();
      const nativeInfo: NativeNetworkSnapshot | null = native?.networkInfo?.() ?? null;
      if (hasAnyNetworkValue(nativeInfo) && nativeInfo) {
        const snapshot: NetworkInfo = {
          ipv4:
            typeof nativeInfo.ipv4 === 'string' && isIP(nativeInfo.ipv4) == 4
              ? nativeInfo.ipv4
              : undefined,
          ipv6:
            typeof nativeInfo.ipv6 === 'string' && isIP(nativeInfo.ipv6) == 6
              ? nativeInfo.ipv6
              : undefined,
          mac: normalizeMac(nativeInfo.mac),
          gateway:
            typeof nativeInfo.gateway === 'string' && isIP(nativeInfo.gateway) == 4
              ? nativeInfo.gateway
              : undefined,
          dns: Array.isArray(nativeInfo.dns)
            ? nativeInfo.dns.filter((value) => typeof value === 'string' && isIP(value) !== 0)
            : undefined,
          subnetMask:
            typeof nativeInfo.subnetMask === 'string' && isIP(nativeInfo.subnetMask) == 4
              ? nativeInfo.subnetMask
              : undefined,
        };
        if (
          !snapshot.ipv4 ||
          !snapshot.gateway ||
          !snapshot.subnetMask ||
          !snapshot.mac ||
          !snapshot.dns?.length
        ) {
          const fallback = await this.resolveFallbackNetworkInfo();
          for (const key of ['ipv4', 'ipv6', 'mac', 'gateway', 'subnetMask', 'dns'] as const) {
            if (!snapshot[key] || (Array.isArray(snapshot[key]) && !snapshot[key]?.length)) {
              Object.assign(snapshot, { [key]: fallback[key] });
            }
          }
        }
        return snapshot;
      }
      return this.resolveFallbackNetworkInfo();
    })();
    this.networkSnapshotPromise = pending;

    try {
      const result = await pending;
      if (generation !== this.generation || this.networkSnapshotPromise !== pending)
        return this.getNetworkInfo();
      this.networkSnapshot = result;
      // Native interfaces are stable enough for 15s; route/DNS data can be held for 60s.
      this.networkSnapshotAt = Date.now();
      return result;
    } catch (error) {
      devLog.error('Failed to get network info:', error);
      return {};
    } finally {
      if (this.networkSnapshotPromise === pending) this.networkSnapshotPromise = null;
    }
  }

  private async resolveFallbackNetworkInfo(): Promise<NetworkInfo> {
    switch (this.platform) {
      case 'darwin':
        return resolveMacOSNetworkInfo();
      case 'win32':
        return resolveWindowsNetworkInfo();
      case 'linux':
        return resolveLinuxNetworkInfo();
      default:
        return {};
    }
  }

  /**
   * 连接到指定 WiFi（暂不实现）
   */
  async connect(_ssid: string, _password: string): Promise<boolean> {
    devLog.warn('WiFi connection not implemented on desktop');
    return false;
  }

  /**
   * 断开 WiFi（暂不实现）
   */
  async disconnect(): Promise<void> {
    devLog.warn('WiFi disconnection not implemented on desktop');
  }

  /**
   * 获取可用 WiFi 列表（暂不实现）
   */
  async scan(): Promise<WifiInfo[]> {
    devLog.warn('WiFi scanning not implemented on desktop');
    return [];
  }
}

/**
 * 创建桌面端 WiFi 适配器实例
 */
export function createDesktopWifiAdapter(): DesktopWifiAdapter {
  return new DesktopWifiAdapter();
}
