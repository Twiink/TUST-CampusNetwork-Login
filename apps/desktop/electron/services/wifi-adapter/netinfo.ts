import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as os from 'node:os';
import type { NetworkInfo } from '@repo/shared';
import { resolveMacOSWifiDevice } from './macos';
import { devLog } from '../../utils/dev-log';

const execAsync = promisify(exec);

/**
 * macOS: 获取网络配置信息
 */
export async function resolveMacOSNetworkInfo(): Promise<NetworkInfo> {
  const info: NetworkInfo = {};

  try {
    // 使用 Node.js 内置 API 获取网络接口信息
    const device = await resolveMacOSWifiDevice();
    if (!device) return info;
    const interfaces = os.networkInterfaces();

    // 查找 WiFi 接口（通常是 en0）
    const wifiInterface = interfaces[device] || [];

    for (const iface of wifiInterface) {
      if (!iface.internal) {
        if (iface.family === 'IPv4') {
          info.ipv4 = iface.address;
          info.subnetMask = iface.netmask;
          info.mac = iface.mac;
        } else if (iface.family === 'IPv6') {
          info.ipv6 = iface.address;
        }
      }
    }

    // 获取网关
    try {
      const { stdout } = await execAsync(`netstat -nr | grep default | grep ${device}`);
      const match = stdout.match(/default\s+(\d+\.\d+\.\d+\.\d+)/);
      if (match) {
        info.gateway = match[1];
      }
    } catch {
      // 忽略错误
    }

    // 获取 DNS
    try {
      const { stdout } = await execAsync('scutil --dns | grep nameserver');
      const dnsServers: string[] = [];
      const matches = stdout.matchAll(/nameserver\[\d+\]\s*:\s*(\S+)/g);
      for (const match of matches) {
        if (match[1] && !dnsServers.includes(match[1])) {
          dnsServers.push(match[1]);
        }
      }
      if (dnsServers.length > 0) {
        info.dns = dnsServers;
      }
    } catch {
      // 忽略错误
    }
  } catch (error) {
    devLog.error('Failed to get macOS network info:', error);
  }

  return info;
}

/**
 * Windows: 获取网络配置信息
 */
export async function resolveWindowsNetworkInfo(): Promise<NetworkInfo> {
  const info: NetworkInfo = {};

  try {
    // 使用 chcp 65001 切换到 UTF-8 编码，避免中文乱码
    const { stdout } = await execAsync('chcp 65001 >nul && ipconfig /all', {
      encoding: 'buffer',
    });

    const output = stdout.toString('utf8');

    // 查找 WiFi 适配器部分（支持中英文）
    const sections = output.split(/(?=^[^\r\n]*(?:adapter|适配器)[^\r\n]*:\s*$)/gim);
    let wifiSection = '';

    for (const section of sections) {
      // 支持英文和中文的 WiFi 适配器名称
      if (
        section.includes('Wireless') ||
        section.includes('Wi-Fi') ||
        section.includes('WLAN') ||
        section.includes('无线') ||
        section.includes('无线局域网适配器')
      ) {
        wifiSection = section;
        break;
      }
    }

    if (wifiSection) {
      const lines = wifiSection.split(/\r?\n/);

      for (const line of lines) {
        const trimmed = line.trim();

        // IPv4（支持中英文）
        if ((trimmed.includes('IPv4') || trimmed.includes('IPv4 地址')) && trimmed.includes(':')) {
          const match = trimmed.match(/:\s*(\d+\.\d+\.\d+\.\d+)/);
          if (match) {
            info.ipv4 = match[1];
          }
        }

        // IPv6（支持中英文）
        if ((trimmed.includes('IPv6') || trimmed.includes('IPv6 地址')) && trimmed.includes(':')) {
          const match = trimmed.match(/:\s*([0-9a-fA-F:]+)/);
          if (match && match[1].includes(':')) {
            info.ipv6 = match[1].replace(/\(.*\)/, '').trim();
          }
        }

        // 子网掩码（支持中英文）
        if (
          (trimmed.includes('Subnet Mask') || trimmed.includes('子网掩码')) &&
          trimmed.includes(':')
        ) {
          const match = trimmed.match(/:\s*(\d+\.\d+\.\d+\.\d+)/);
          if (match) {
            info.subnetMask = match[1];
          }
        }

        // 默认网关（支持中英文）
        if (
          (trimmed.includes('Default Gateway') || trimmed.includes('默认网关')) &&
          trimmed.includes(':')
        ) {
          const match = trimmed.match(/:\s*(\d+\.\d+\.\d+\.\d+)/);
          if (match) {
            info.gateway = match[1];
          }
        }

        // DNS 服务器（支持中英文）
        if (
          (trimmed.includes('DNS Servers') || trimmed.includes('DNS 服务器')) &&
          trimmed.includes(':')
        ) {
          const match = trimmed.match(/:\s*(\d+\.\d+\.\d+\.\d+)/);
          if (match) {
            info.dns = [match[1]];
          }
        }

        // MAC 地址（支持中英文）
        if (
          (trimmed.includes('Physical Address') || trimmed.includes('物理地址')) &&
          trimmed.includes(':')
        ) {
          const match = trimmed.match(/:\s*([0-9A-F-]+)/i);
          if (match) {
            info.mac = match[1].replace(/-/g, ':');
          }
        }
      }
    }
  } catch (error) {
    devLog.error('Failed to get Windows network info:', error);
  }

  return info;
}
