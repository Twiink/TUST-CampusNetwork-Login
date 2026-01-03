/**
 * 桌面端 WiFi 适配器实现
 * 支持 Windows 和 macOS
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { WifiAdapter, WifiInfo, WifiDetails, NetworkInfo } from '@repo/shared';
import * as os from 'node:os';

const execAsync = promisify(exec);

/**
 * 桌面端 WiFi 适配器
 */
export class DesktopWifiAdapter implements WifiAdapter {
  private platform: NodeJS.Platform;

  constructor() {
    this.platform = process.platform;
  }

  /**
   * 获取当前连接的 WiFi 信息
   */
  async getCurrentWifi(): Promise<WifiInfo | null> {
    try {
      switch (this.platform) {
        case 'darwin':
          return await this.getMacOSWifiInfo();
        case 'win32':
          return await this.getWindowsWifiInfo();
        default:
          return null;
      }
    } catch (error) {
      console.error('Failed to get WiFi info:', error);
      return null;
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
          return await this.getMacOSNetworkInfo();
        case 'win32':
          return await this.getWindowsNetworkInfo();
        default:
          return {};
      }
    } catch (error) {
      console.error('Failed to get network info:', error);
      return {};
    }
  }

  /**
   * 连接到指定 WiFi（暂不实现）
   */
  async connect(_ssid: string, _password: string): Promise<boolean> {
    console.warn('WiFi connection not implemented on desktop');
    return false;
  }

  /**
   * 断开 WiFi（暂不实现）
   */
  async disconnect(): Promise<void> {
    console.warn('WiFi disconnection not implemented on desktop');
  }

  /**
   * 获取可用 WiFi 列表（暂不实现）
   */
  async scan(): Promise<WifiInfo[]> {
    console.warn('WiFi scanning not implemented on desktop');
    return [];
  }

  /**
   * macOS: 获取 WiFi 信息
   */
  private async getMacOSWifiInfo(): Promise<WifiInfo | null> {
    try {
      const { stdout } = await execAsync(
        '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I'
      );

      const lines = stdout.split('\n');
      const data: Record<string, string> = {};

      for (const line of lines) {
        const match = line.match(/^\s*(\w+):\s*(.+)$/);
        if (match) {
          data[match[1].toLowerCase()] = match[2].trim();
        }
      }

      const ssid = data['ssid'];
      if (!ssid) {
        return null;
      }

      // 信号强度：RSSI (通常是负值，需要转换为0-100)
      const rssi = parseInt(data['agrctlrssi'] || data['rssi'] || '-50');
      const signalStrength = this.rssiToPercentage(rssi);

      // 连接速度：lastTxRate (Mbps)
      const linkSpeed = parseInt(data['lasttxrate'] || '0');

      // 频段和信道
      const channel = parseInt(data['channel'] || '0');
      const frequency = channel > 14 ? 5000 : 2400;

      // BSSID
      const bssid = data['bssid'] || undefined;

      // 安全类型
      const security = data['link auth'] || undefined;

      return {
        ssid,
        bssid,
        signalStrength,
        linkSpeed,
        frequency,
        channel,
        security,
        connected: true,
      };
    } catch (error) {
      console.error('Failed to get macOS WiFi info:', error);
      return null;
    }
  }

  /**
   * Windows: 获取 WiFi 信息
   */
  private async getWindowsWifiInfo(): Promise<WifiInfo | null> {
    try {
      // 使用 chcp 65001 切换到 UTF-8 编码，避免中文乱码
      const { stdout } = await execAsync('chcp 65001 >nul && netsh wlan show interfaces', {
        encoding: 'buffer',  // 先获取原始 buffer
      });

      // 手动使用 UTF-8 解码
      const output = stdout.toString('utf8');

      // 使用正则分割行，同时处理 \r\n 和 \n
      const lines = output.split(/\r?\n/);
      const data: Record<string, string> = {};

      for (const line of lines) {
        // 去除首尾空白
        const trimmedLine = line.trim();

        // 匹配键值对格式：Key : Value
        const match = trimmedLine.match(/^([^:]+?)\s*:\s*(.+)$/);
        if (match) {
          const key = match[1].trim().toLowerCase();
          const value = match[2].trim();
          data[key] = value;
        }
      }

      // SSID（支持中英文）
      const ssid = data['ssid'] || data['名称'] || '';

      // 如果 SSID 是乱码，尝试使用不带 chcp 的命令重新获取
      let finalSsid = ssid;
      // eslint-disable-next-line no-control-regex
      if (!ssid || ssid.includes('�') || /[\x00-\x1F\x7F]/.test(ssid)) {
        try {
          // 使用 GBK 编码重新获取 SSID
          const { stdout: rawOutput } = await execAsync('netsh wlan show interfaces', {
            encoding: 'buffer',
          });
          const gbkOutput = rawOutput.toString('gbk' as BufferEncoding);
          const ssidMatch = gbkOutput.match(/^\s*SSID\s*:\s*(.+)$/m);
          if (ssidMatch && ssidMatch[1]) {
            finalSsid = ssidMatch[1].trim();
          }
        } catch (err) {
          console.error('[WiFiAdapter] Failed to get SSID with GBK encoding:', err);
        }
      }

      if (!finalSsid) {
        return null;
      }

      // 信号强度：Signal (百分比) - 支持中英文
      const signalStr = data['signal'] || data['信号'] || '0%';
      const signalStrength = parseInt(signalStr.replace('%', '')) || 0;

      // 连接速度：Receive rate 或 Transmit rate (Mbps) - 支持中英文
      const receiveRateStr = data['receive rate'] || data['receive rate (mbps)'] || data['接收速率'] || '0';
      const transmitRateStr = data['transmit rate'] || data['transmit rate (mbps)'] || data['传输速率'] || '0';
      const receiveRate = parseFloat(receiveRateStr) || 0;
      const transmitRate = parseFloat(transmitRateStr) || 0;
      const linkSpeed = Math.max(receiveRate, transmitRate);

      // 信道：Channel - 支持中英文
      const channelStr = data['channel'] || data['信道'] || '0';
      const channel = parseInt(channelStr) || 0;

      // 根据信道判断频段
      const frequency = channel > 14 ? 5000 : channel > 0 ? 2400 : 0;

      // BSSID - 支持中英文
      const bssid = data['bssid'] || data['bssid'] || undefined;

      // 安全类型：Authentication - 支持中英文
      const security = data['authentication'] || data['身份验证'] || undefined;

      return {
        ssid,
        bssid,
        signalStrength,
        linkSpeed,
        frequency,
        channel: channel || undefined,
        security,
        connected: true,
      };
    } catch (error) {
      console.error('Failed to get Windows WiFi info:', error);
      return null;
    }
  }

  /**
   * macOS: 获取网络配置信息
   */
  private async getMacOSNetworkInfo(): Promise<NetworkInfo> {
    const info: NetworkInfo = {};

    try {
      // 使用 Node.js 内置 API 获取网络接口信息
      const interfaces = os.networkInterfaces();

      // 查找 WiFi 接口（通常是 en0）
      const wifiInterface = interfaces['en0'] || [];

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
        const { stdout } = await execAsync('netstat -nr | grep default | grep en0');
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
      console.error('Failed to get macOS network info:', error);
    }

    return info;
  }

  /**
   * Windows: 获取网络配置信息
   */
  private async getWindowsNetworkInfo(): Promise<NetworkInfo> {
    const info: NetworkInfo = {};

    try {
      // 使用 chcp 65001 切换到 UTF-8 编码，避免中文乱码
      const { stdout } = await execAsync('chcp 65001 >nul && ipconfig /all', {
        encoding: 'buffer',
      });

      const output = stdout.toString('utf8');

      // 查找 WiFi 适配器部分（支持中英文）
      const sections = output.split('\n\n');
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
          if ((trimmed.includes('Subnet Mask') || trimmed.includes('子网掩码')) && trimmed.includes(':')) {
            const match = trimmed.match(/:\s*(\d+\.\d+\.\d+\.\d+)/);
            if (match) {
              info.subnetMask = match[1];
            }
          }

          // 默认网关（支持中英文）
          if ((trimmed.includes('Default Gateway') || trimmed.includes('默认网关')) && trimmed.includes(':')) {
            const match = trimmed.match(/:\s*(\d+\.\d+\.\d+\.\d+)/);
            if (match) {
              info.gateway = match[1];
            }
          }

          // DNS 服务器（支持中英文）
          if ((trimmed.includes('DNS Servers') || trimmed.includes('DNS 服务器')) && trimmed.includes(':')) {
            const match = trimmed.match(/:\s*(\d+\.\d+\.\d+\.\d+)/);
            if (match) {
              info.dns = [match[1]];
            }
          }

          // MAC 地址（支持中英文）
          if ((trimmed.includes('Physical Address') || trimmed.includes('物理地址')) && trimmed.includes(':')) {
            const match = trimmed.match(/:\s*([0-9A-F-]+)/i);
            if (match) {
              info.mac = match[1].replace(/-/g, ':');
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to get Windows network info:', error);
    }

    return info;
  }

  /**
   * 将 RSSI 转换为百分比信号强度
   * RSSI 范围通常是 -100 到 -40 dBm
   * @param rssi RSSI 值（负数）
   * @returns 信号强度百分比 (0-100)
   */
  private rssiToPercentage(rssi: number): number {
    if (rssi >= -40) return 100;
    if (rssi <= -100) return 0;
    return Math.round(((rssi + 100) / 60) * 100);
  }
}

/**
 * 创建桌面端 WiFi 适配器实例
 */
export function createDesktopWifiAdapter(): DesktopWifiAdapter {
  return new DesktopWifiAdapter();
}
