/**
 * 网络工具 - Electron 平台实现
 */

import * as os from 'node:os';
import { NetworkInterface } from '@repo/shared';
import { getCurrentWifiSSID, WifiStatus } from './wifi-detector';

// 重新导出 WiFi 检测功能
export { getCurrentWifiSSID };
export type { WifiStatus };

/**
 * 获取网络接口列表
 */
export function getNetworkInterfaces(): NetworkInterface[] {
  const interfaces = os.networkInterfaces();
  const result: NetworkInterface[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;

    const iface: NetworkInterface = {
      name,
      internal: false,
    };

    for (const addr of addrs) {
      if (addr.internal) {
        iface.internal = true;
        continue;
      }

      if (addr.family === 'IPv4') {
        iface.ipv4 = addr.address;
        iface.mac = addr.mac;
      } else if (addr.family === 'IPv6' && !addr.address.startsWith('fe80')) {
        // 排除链路本地地址
        iface.ipv6 = addr.address;
      }
    }

    // 只添加非内部且有 IP 的接口
    if (!iface.internal && (iface.ipv4 || iface.ipv6)) {
      result.push(iface);
    }
  }

  return result;
}

/**
 * 获取本机 IPv4 地址
 */
export function getLocalIPv4(): string | null {
  const interfaces = getNetworkInterfaces();

  // 优先选择 en0 (macOS) 或 eth0/wlan0 (Linux)
  const preferredNames = ['en0', 'eth0', 'wlan0', 'Wi-Fi', 'Ethernet'];

  for (const name of preferredNames) {
    const iface = interfaces.find((i) => i.name === name);
    if (iface?.ipv4) {
      return iface.ipv4;
    }
  }

  // 返回第一个有 IPv4 的接口
  const firstWithIpv4 = interfaces.find((i) => i.ipv4);
  return firstWithIpv4?.ipv4 || null;
}

/**
 * 获取本机 IPv6 地址
 */
export function getLocalIPv6(): string | null {
  const interfaces = getNetworkInterfaces();

  // 优先选择 en0 (macOS) 或 eth0/wlan0 (Linux)
  const preferredNames = ['en0', 'eth0', 'wlan0', 'Wi-Fi', 'Ethernet'];

  for (const name of preferredNames) {
    const iface = interfaces.find((i) => i.name === name);
    if (iface?.ipv6) {
      return iface.ipv6;
    }
  }

  // 返回第一个有 IPv6 的接口
  const firstWithIpv6 = interfaces.find((i) => i.ipv6);
  return firstWithIpv6?.ipv6 || null;
}

/**
 * 获取本机 MAC 地址
 */
export function getLocalMAC(): string | null {
  const interfaces = getNetworkInterfaces();

  // 优先选择 en0 (macOS) 或 eth0/wlan0 (Linux)
  const preferredNames = ['en0', 'eth0', 'wlan0', 'Wi-Fi', 'Ethernet'];

  for (const name of preferredNames) {
    const iface = interfaces.find((i) => i.name === name);
    if (iface?.mac && iface.mac !== '00:00:00:00:00:00') {
      return iface.mac.replace(/:/g, '');
    }
  }

  // 返回第一个有效的 MAC
  const firstWithMac = interfaces.find((i) => i.mac && i.mac !== '00:00:00:00:00:00');
  return firstWithMac?.mac?.replace(/:/g, '') || null;
}

/**
 * 获取网络信息
 */
export function getNetworkInfo(): {
  ipv4: string | null;
  ipv6: string | null;
  mac: string | null;
} {
  return {
    ipv4: getLocalIPv4(),
    ipv6: getLocalIPv6(),
    mac: getLocalMAC(),
  };
}

/**
 * 获取完整网络信息（包含 WiFi SSID）
 */
export async function getFullNetworkInfo(): Promise<{
  ipv4: string | null;
  ipv6: string | null;
  mac: string | null;
  wifi: WifiStatus;
}> {
  const [networkInfo, wifiStatus] = await Promise.all([
    Promise.resolve(getNetworkInfo()),
    getCurrentWifiSSID(),
  ]);

  return {
    ...networkInfo,
    wifi: wifiStatus,
  };
}
