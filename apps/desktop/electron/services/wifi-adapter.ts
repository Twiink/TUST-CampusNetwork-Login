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

let nativeModule:
  | {
      currentWifi?: () => NativeWifiSnapshot | null;
      networkInfo?: () => unknown | null;
    }
  | null
  | undefined;

/**
 * 优先加载 Rust nl80211/CoreWLAN 原生模块；失败自动回退 TS spawn 路径。
 */
export function resetNativeWifiModuleForTests(): void {
  nativeModule = undefined;
}

function loadNativeModule() {
  if (nativeModule !== undefined) return nativeModule;
  try {
    nativeModule = nativeEntry as unknown as typeof nativeModule;
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

/**
 * 桌面端 WiFi 适配器
 */
export class DesktopWifiAdapter implements WifiAdapter {
  private platform: NodeJS.Platform;
  private snapshot: WifiInfo | null = null;
  private snapshotAt = 0;
  private snapshotPromise: Promise<WifiInfo | null> | null = null;

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

    this.snapshotPromise = (async () => {
      try {
        switch (this.platform) {
          case 'darwin':
            return await resolveMacOSWifiInfo();
          case 'win32':
            return await resolveWindowsWifiInfo();
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

    try {
      const result = await this.snapshotPromise;
      this.snapshot = result;
      this.snapshotAt = Date.now();
      return result;
    } finally {
      this.snapshotPromise = null;
    }
  }

  /**
   * 获取完整的 WiFi 详细信息
   */
  async getWifiDetails(): Promise<WifiDetails | null> {
    const wifiInfo = await this.getCurrentWifi();
    if (!wifiInfo) {
      return null;
    }

    const networkInfo = await this.getNetworkInfo();

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
  async getNetworkInfo(): Promise<NetworkInfo> {
    try {
      switch (this.platform) {
        case 'darwin':
          return await resolveMacOSNetworkInfo();
        case 'win32':
          return await resolveWindowsNetworkInfo();
        case 'linux':
          return await resolveLinuxNetworkInfo();
        default:
          return {};
      }
    } catch (error) {
      devLog.error('Failed to get network info:', error);
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
