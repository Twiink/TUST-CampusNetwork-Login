import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { WifiInfo } from '@repo/shared';
import { devLog } from '../../utils/dev-log';

const execAsync = promisify(exec);
const AIRPORT_PATH =
  '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport';

/** RSSI(dBm, 约 -100..0)折算为 0-100 百分比 */
function rssiToPercentage(rssi: number): number {
  return Math.min(100, Math.max(0, rssi + 100));
}

function parseAirportOutput(stdout: string): WifiInfo | null {
  const data: Record<string, string> = {};
  for (const line of stdout.split('\n')) {
    const match = line.match(/^\s*([^:]+):\s*(.*)$/);
    if (match) {
      data[match[1].trim().toLowerCase()] = match[2].trim();
    }
  }

  const ssid = data['ssid'];
  if (!ssid) {
    return null;
  }

  const rssi = parseInt(data['agrctlrssi'] || data['rssi'] || '', 10);
  const linkSpeed = parseFloat(data['lasttxrate'] || data['txrate'] || '0');
  const channelText = data['channel'];
  const channelMatch = channelText?.match(/^(\d+)/);
  const channel = channelMatch ? parseInt(channelMatch[1], 10) : 0;

  return {
    ssid,
    bssid: data['bssid'] || undefined,
    signalStrength: Number.isFinite(rssi) ? rssiToPercentage(rssi) : 0,
    linkSpeed: Number.isFinite(linkSpeed) ? linkSpeed : 0,
    frequency: channel > 14 ? 5000 : channel > 0 ? 2400 : 0,
    channel: channel || undefined,
    security: data['security'] || undefined,
    connected: true,
  };
}

/**
 * macOS: 获取 WiFi 信息。airport CLI 快且轻；system_profiler 在新版 macOS
 * 已经移除该命令且耗时可到数秒，不适合作为探测热路径。
 */
export async function resolveMacOSWifiInfo(): Promise<WifiInfo | null> {
  try {
    const { stdout } = await execAsync(`${AIRPORT_PATH} -I`, { timeout: 2000 });
    const info = parseAirportOutput(stdout);
    if (info) {
      return info;
    }
  } catch (error) {
    devLog.info('airport CLI unavailable:', error instanceof Error ? error.message : error);
  }

  return await macOSWifiFallback();
}

/**
 * macOS: 备选方法获取 WiFi 信息
 */
export async function macOSWifiFallback(): Promise<WifiInfo | null> {
  try {
    const { stdout } = await execAsync('networksetup -getairportnetwork en0');
    const match = stdout.match(/Current Wi-Fi Network:\s*(.+)/);
    if (match && match[1]) {
      const ssid = match[1].trim();
      // 未连接时 macOS 输出占位文本（如 "(not connected)"），不能当 SSID
      if (ssid && !/^[(（].*[)）]$/.test(ssid)) {
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
