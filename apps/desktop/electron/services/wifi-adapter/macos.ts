import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { WifiInfo } from '@repo/shared';
import { devLog } from '../../utils/dev-log';

const execAsync = promisify(exec);

/**
 * macOS: 获取 WiFi 信息
 */
export async function resolveMacOSWifiInfo(): Promise<WifiInfo | null> {
  try {
    // 方法1: 使用 system_profiler（推荐，在新版 macOS 上稳定可靠）
    const { stdout } = await execAsync(
      'system_profiler SPAirPortDataType 2>/dev/null',
      { timeout: 10000 } // 增加到10秒超时
    );

    // 解析输出获取当前网络信息
    const lines = stdout.split('\n');
    let inCurrentNetwork = false;
    let ssid = '';
    const data: Record<string, string> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检测 "Current Network Information:" 标记
      if (line.includes('Current Network Information:')) {
        inCurrentNetwork = true;
        // 下一行通常是 SSID（以冒号结尾）
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const ssidMatch = nextLine.match(/^([^:]+):$/);
          if (ssidMatch) {
            ssid = ssidMatch[1].trim();
          }
        }
        continue;
      }

      // 在当前网络信息块中，解析键值对
      if (inCurrentNetwork && ssid) {
        // 遇到 "Other Local Wi-Fi Networks" 或新的节标题时退出
        if (line.includes('Other Local Wi-Fi Networks') || line.includes('Interfaces:')) {
          break;
        }

        // 解析键值对: "Key: Value"
        const match = line.match(/^\s+([^:]+):\s*(.+)$/);
        if (match) {
          const key = match[1].trim().toLowerCase();
          const value = match[2].trim();
          data[key] = value;
        }
      }
    }

    if (!ssid) {
      // 如果 system_profiler 失败，尝试备选方法
      return await macOSWifiFallback();
    }

    // 解析信号强度：Signal / Noise: -45 dBm / -90 dBm
    let signalStrength = 0;
    if (data['signal / noise']) {
      const signalMatch = data['signal / noise'].match(/-?\d+/);
      if (signalMatch) {
        const rssi = parseInt(signalMatch[0]);
        signalStrength = rssiToPercentage(rssi);
      }
    }

    // 解析连接速度：Transmit Rate: 960
    let linkSpeed = parseInt(data['transmit rate'] || '0');

    // 如果连接速度为 0，可能是刚连接还没初始化，等待后重试一次
    if (linkSpeed === 0 && data['mcs index']) {
      await new Promise((resolve) => setTimeout(resolve, 800));

      try {
        const { stdout: retryStdout } = await execAsync(
          'system_profiler SPAirPortDataType 2>/dev/null',
          { timeout: 10000 } // 增加到10秒超时
        );

        const retryLines = retryStdout.split('\n');
        const retryData: Record<string, string> = {};
        let inRetryCurrentNetwork = false;
        let retryFoundSsid = false;

        for (let i = 0; i < retryLines.length; i++) {
          const line = retryLines[i];
          if (line.includes('Current Network Information:')) {
            inRetryCurrentNetwork = true;
            if (i + 1 < retryLines.length) {
              const nextLine = retryLines[i + 1].trim();
              const ssidMatch = nextLine.match(/^([^:]+):$/);
              if (ssidMatch && ssidMatch[1].trim() === ssid) {
                retryFoundSsid = true;
              }
            }
            continue;
          }

          if (inRetryCurrentNetwork && retryFoundSsid) {
            if (line.includes('Other Local Wi-Fi Networks') || line.includes('Interfaces:')) {
              break;
            }
            const match = line.match(/^\s+([^:]+):\s*(.+)$/);
            if (match) {
              const key = match[1].trim().toLowerCase();
              const value = match[2].trim();
              retryData[key] = value;
            }
          }
        }

        const retryLinkSpeed = parseInt(retryData['transmit rate'] || '0');
        if (retryLinkSpeed > 0) {
          linkSpeed = retryLinkSpeed;
        }
      } catch {
        // 重试失败，使用原值
      }
    }

    // 解析信道：Channel: 36 (5GHz, 80MHz)
    let channel = 0;
    let frequency = 0;
    if (data['channel']) {
      const channelMatch = data['channel'].match(/(\d+)\s*\((\d+)GHz/);
      if (channelMatch) {
        channel = parseInt(channelMatch[1]);
        const ghz = parseInt(channelMatch[2]);
        frequency = ghz === 5 ? 5000 : 2400;
      } else {
        channel = parseInt(data['channel']) || 0;
        frequency = channel > 14 ? 5000 : 2400;
      }
    }

    // 解析安全类型：Security: WPA2 Personal
    const security = data['security'] || undefined;

    // 注意：system_profiler 不直接提供 BSSID，如果需要可以通过其他命令获取
    const bssid = undefined;

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
    devLog.error('Failed to get macOS WiFi info with system_profiler:', error);
    // 如果 system_profiler 失败，尝试备选方法
    return await macOSWifiFallback();
  }
}

/**
 * macOS: 备选方法获取 WiFi 信息
 */
export async function macOSWifiFallback(): Promise<WifiInfo | null> {
  try {
    // 方法2: 尝试使用 networksetup
    const { stdout } = await execAsync('networksetup -getairportnetwork en0');
    const match = stdout.match(/Current Wi-Fi Network:\s*(.+)/);
    if (match && match[1]) {
      const ssid = match[1].trim();
      // 未连接时 macOS 输出占位文本（如 "(not connected)"），不能当 SSID
      if (ssid && !/^[(（].*[)）]$/.test(ssid)) {
        // 只能获取 SSID，其他信息无法获取
        return {
          ssid,
          connected: true,
          signalStrength: 0,
          linkSpeed: 0,
          frequency: 0,
        };
      }
    }
  } catch (error) {
    devLog.error('Failed to get macOS WiFi info with networksetup:', error);
  }

  return null;
}
/** RSSI(dBm, 约 -100..0)折算为 0-100 百分比 */
function rssiToPercentage(rssi: number): number {
  return Math.min(100, Math.max(0, rssi + 100));
}
