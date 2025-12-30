/**
 * WiFi SSID 检测服务 - 跨平台实现
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface WifiStatus {
  connected: boolean;
  ssid: string | null;
}

/**
 * 获取当前连接的 WiFi SSID
 */
export async function getCurrentWifiSSID(): Promise<WifiStatus> {
  const platform = process.platform;

  try {
    switch (platform) {
      case 'darwin':
        return await getMacOSWifiSSID();
      case 'win32':
        return await getWindowsWifiSSID();
      case 'linux':
        return await getLinuxWifiSSID();
      default:
        return { connected: false, ssid: null };
    }
  } catch (error) {
    console.error('Failed to get WiFi SSID:', error);
    return { connected: false, ssid: null };
  }
}

/**
 * macOS: 使用 airport 命令获取 SSID
 */
async function getMacOSWifiSSID(): Promise<WifiStatus> {
  try {
    // 方法1: 使用 airport 命令（更可靠）
    const { stdout } = await execAsync(
      '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I'
    );

    // 解析输出，查找 SSID 行
    const ssidMatch = stdout.match(/\s+SSID:\s*(.+)/);
    if (ssidMatch && ssidMatch[1]) {
      const ssid = ssidMatch[1].trim();
      return { connected: true, ssid };
    }

    return { connected: false, ssid: null };
  } catch {
    // 备选方法: networksetup
    try {
      const { stdout } = await execAsync('networksetup -getairportnetwork en0');
      const match = stdout.match(/Current Wi-Fi Network:\s*(.+)/);
      if (match && match[1]) {
        return { connected: true, ssid: match[1].trim() };
      }
    } catch {
      // 忽略错误
    }
    return { connected: false, ssid: null };
  }
}

/**
 * Windows: 使用 netsh 命令获取 SSID
 */
async function getWindowsWifiSSID(): Promise<WifiStatus> {
  try {
    const { stdout } = await execAsync('netsh wlan show interfaces');

    // 英文系统: SSID : xxx
    let match = stdout.match(/^\s*SSID\s*:\s*(.+)$/m);
    if (!match) {
      // 中文系统: SSID : xxx
      match = stdout.match(/^\s*SSID\s*:\s*(.+)$/im);
    }

    if (match && match[1]) {
      const ssid = match[1].trim();
      if (ssid && ssid !== '') {
        return { connected: true, ssid };
      }
    }

    return { connected: false, ssid: null };
  } catch {
    return { connected: false, ssid: null };
  }
}

/**
 * Linux: 使用 nmcli 命令获取 SSID
 */
async function getLinuxWifiSSID(): Promise<WifiStatus> {
  try {
    // 使用 nmcli 获取当前连接的 WiFi
    const { stdout } = await execAsync('nmcli -t -f active,ssid dev wifi');

    // 查找活跃的连接
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (line.startsWith('yes:')) {
        const ssid = line.substring(4).trim();
        if (ssid) {
          return { connected: true, ssid };
        }
      }
    }

    return { connected: false, ssid: null };
  } catch {
    // 备选方法: iwgetid
    try {
      const { stdout } = await execAsync('iwgetid -r');
      const ssid = stdout.trim();
      if (ssid) {
        return { connected: true, ssid };
      }
    } catch {
      // 忽略错误
    }
    return { connected: false, ssid: null };
  }
}
