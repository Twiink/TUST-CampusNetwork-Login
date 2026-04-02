/**
 * 系统信息采集服务
 * 仅在导出日志时实时采集，不持久化
 */

import * as os from 'node:os';
import type { SystemInfo } from '@repo/shared';
import { getLocalIPv4, getLocalMAC, getNetworkInterfaces } from './network';
import { getCurrentWifiSSID } from './wifi-detector';
import { getResolvedAppVersion } from '../utils/app-version';

/**
 * 采集当前系统信息
 */
export async function collectSystemInfo(): Promise<SystemInfo> {
  const cpus = os.cpus();
  const wifiStatus = await getCurrentWifiSSID();

  // 找到主要网络接口
  const interfaces = getNetworkInterfaces();
  const primaryInterface = interfaces.length > 0 ? interfaces[0].name : undefined;

  const ipv4 = getLocalIPv4();
  const mac = getLocalMAC();

  return {
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
    },
    app: {
      version: getResolvedAppVersion(),
      electronVersion: process.versions.electron || 'unknown',
      nodeVersion: process.versions.node || 'unknown',
      chromeVersion: process.versions.chrome || 'unknown',
    },
    hardware: {
      cpuModel: cpus.length > 0 ? cpus[0].model : 'unknown',
      cpuCores: cpus.length,
      totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
      freeMemoryMB: Math.round(os.freemem() / 1024 / 1024),
    },
    network: {
      interface: primaryInterface,
      ipv4: ipv4 || undefined,
      mac: mac || undefined,
      wifiSSID: wifiStatus.connected ? wifiStatus.ssid || undefined : undefined,
    },
    collectedAt: new Date().toISOString(),
  };
}
