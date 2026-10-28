/**
 * 网络工具 - Electron 平台实现
 */

import * as os from 'node:os';
import * as dgram from 'dgram';
import { NetworkInterface, NetworkStatus, WifiManager, DEFAULT_SERVER_URL } from '@repo/shared';
import { getCurrentWifiSSID, WifiStatus } from './wifi-detector';

// 重新导出 WiFi 检测功能
export { getCurrentWifiSSID };
export type { WifiStatus };

/**
 * 用 WiFi 配置补齐网络状态的认证相关字段（requiresAuth/isConfigured/hasLinkedAccount）。
 * 判定走 WifiManager.resolveAuthRequirement 三级逻辑：
 * 已配置 WiFi 用用户配置，未配置 WiFi 退回校园网 SSID+IP 启发式（对齐参考实现）。
 * 心跳回调与 WiFi 事件回调共用，保证两条触发路径判定一致。
 */
export function enrichStatusAuthFields(status: NetworkStatus, wifiManager: WifiManager): void {
  if (!status.ssid) {
    return;
  }

  const requirement = wifiManager.resolveAuthRequirement(status.ssid, status.ip, status);
  status.isConfigured = requirement.isConfigured;
  status.requiresAuth = requirement.requiresAuth;
  status.hasLinkedAccount = requirement.hasLinkedAccount;
}

/** 解析认证服务器地址（用于路由探测目标） */
function parsePortalEndpoint(serverUrl: string): { host: string; port: number } {
  try {
    const parsed = new URL(serverUrl);
    return { host: parsed.hostname, port: Number(parsed.port) || 80 };
  } catch {
    return { host: '10.10.102.50', port: 801 };
  }
}

/**
 * 路由探测获取出口 IPv4（对齐生产验证的参考实现）
 * 通过 UDP connect 到认证服务器地址，让系统按路由表选出出口网卡的本机 IP。
 * UDP connect 不发送任何报文，未通过认证时同样可用（portal 位于内网）。
 * 多网卡（VPN/Docker/虚拟网卡）场景下比按接口名挑选可靠得多。
 */
function probeRouteIPv4(host: string, port: number, timeoutMs = 500): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ip: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // socket 可能已关闭
      }
      resolve(ip);
    };

    const socket = dgram.createSocket('udp4');
    const timer = setTimeout(() => finish(null), timeoutMs);

    socket.on('error', () => finish(null));
    socket.connect(port, host, () => {
      try {
        const addr = socket.address();
        finish(addr && typeof addr === 'object' ? addr.address : null);
      } catch {
        finish(null);
      }
    });
  });
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

/** 判断是否私网 IPv4（10/8、172.16/12、192.168/16） */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * 解析本机 IPv4（异步，登录前调用）
 * 优先级对齐生产验证的参考实现，并针对全局代理 TUN 做了加固：
 * 1. UDP 路由探测（通往认证服务器的出口网卡 IP，最准确）；
 *    若探测结果非私网地址（如 fake-ip 网段，被 TUN 劫持），降级处理
 * 2. 接口枚举优先 10.x（portal 固定在 10.x 内网，通往它的源地址必为 10.x）
 * 3. 探测结果（私网）或按接口名/首个接口的现有同步逻辑兜底
 */
export async function resolveLocalIPv4(): Promise<string | null> {
  const { host, port } = parsePortalEndpoint(DEFAULT_SERVER_URL);
  const probed = await probeRouteIPv4(host, port);

  // 回退：优先 10.x 地址（对齐参考实现的 selectIPv4）
  const tenX = getNetworkInterfaces().find((i) => i.ipv4?.startsWith('10.'));

  if (probed && isPrivateIPv4(probed)) {
    // 探测到私网出口 IP，且无更优的 10.x 候选（或探测结果本身就是 10.x）
    if (probed.startsWith('10.') || !tenX?.ipv4) {
      return probed;
    }
    return tenX.ipv4;
  }

  if (tenX?.ipv4) {
    return tenX.ipv4;
  }

  if (probed) {
    return probed;
  }

  return getLocalIPv4();
}

/**
 * 获取网络信息（同步，仅用于展示等非关键路径）
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
 * 获取网络信息（异步，登录/重连前调用）
 * IPv4 走路由探测确保拿到出口 IP；IPv6/MAC 用同步枚举即可。
 */
export async function resolveNetworkInfo(): Promise<{
  ipv4: string | null;
  ipv6: string | null;
  mac: string | null;
}> {
  const ipv4 = await resolveLocalIPv4();
  // IPv6 优先取与认证 IPv4 同一网卡的地址，避免 VPN/虚拟网卡的 IPv6 与 IPv4 错配
  const ipv6 = (ipv4 ? getIPv6ForIPv4(ipv4) : null) ?? getLocalIPv6();
  return { ipv4, ipv6, mac: getLocalMAC() };
}

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
      } else if (addr.family === 'IPv6' && isUsableIPv6(addr.address)) {
        // 同一网卡多个 IPv6 时保留第一个全局单播地址，ULA 仅在没有全局地址时兜底
        if (
          !iface.ipv6 ||
          (!isGlobalUnicastIPv6(iface.ipv6) && isGlobalUnicastIPv6(addr.address))
        ) {
          iface.ipv6 = addr.address;
        }
      }
    }

    // 只添加非内部且有 IP 的接口
    if (!iface.internal && (iface.ipv4 || iface.ipv6)) {
      result.push(iface);
    }
  }

  return result;
}

/** 排除回环、未指定、链路本地（fe80::/10）与已弃用的站点本地（fec0::/10）地址 */
function isUsableIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') {
    return false;
  }
  return !/^fe[89a-f]/.test(lower);
}

/** 全局单播地址 2000::/3（对齐参考实现 selectIPv6 的 IsGlobalUnicast 优先级） */
function isGlobalUnicastIPv6(ip: string): boolean {
  return /^[23]/.test(ip);
}

/**
 * 获取与指定 IPv4 位于同一网卡的 IPv6（全局单播优先）
 */
export function getIPv6ForIPv4(ipv4: string): string | null {
  const iface = Object.values(os.networkInterfaces()).find((addrs) =>
    addrs?.some((addr) => addr.family === 'IPv4' && addr.address === ipv4)
  );
  const candidates = (iface ?? [])
    .filter((addr) => addr.family === 'IPv6' && !addr.internal && isUsableIPv6(addr.address))
    .map((addr) => addr.address);
  return candidates.find(isGlobalUnicastIPv6) ?? candidates[0] ?? null;
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

  // 返回第一个有全局 IPv6 的接口，其次任意可用 IPv6
  const firstWithIpv6 =
    interfaces.find((i) => i.ipv6 && isGlobalUnicastIPv6(i.ipv6)) ?? interfaces.find((i) => i.ipv6);
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
