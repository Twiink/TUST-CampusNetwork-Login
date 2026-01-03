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
 * macOS: 使用 system_profiler 命令获取 SSID
 */
async function getMacOSWifiSSID(): Promise<WifiStatus> {
  try {
    // 方法1: 使用 system_profiler（推荐，在新版 macOS 上稳定可靠）
    const { stdout } = await execAsync(
      'system_profiler SPAirPortDataType 2>/dev/null',
      { timeout: 5000 }
    );

    // 解析输出，查找当前网络信息
    const lines = stdout.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检测 "Current Network Information:" 标记
      if (line.includes('Current Network Information:')) {
        // 下一行通常是 SSID（以冒号结尾）
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const ssidMatch = nextLine.match(/^([^:]+):$/);
          if (ssidMatch) {
            const ssid = ssidMatch[1].trim();
            return { connected: true, ssid };
          }
        }
        break;
      }
    }

    // 如果 system_profiler 未找到 SSID，尝试备选方法
    return await getMacOSWifiSSIDFallback();
  } catch {
    // 如果 system_profiler 失败，尝试备选方法
    return await getMacOSWifiSSIDFallback();
  }
}

/**
 * macOS: 备选方法获取 SSID
 */
async function getMacOSWifiSSIDFallback(): Promise<WifiStatus> {
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
