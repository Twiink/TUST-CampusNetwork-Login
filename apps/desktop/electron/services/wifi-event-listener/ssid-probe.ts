/**
 * 轻量 SSID 探测（自 WifiEventListener 抽出）：
 * macOS 走 airport/networksetup，Windows 走 netsh（GBK 解码）。
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Logger } from '@repo/shared';
import { parseNetshSsid } from '../wifi-detector';
import { execWindowsText } from '../../utils/win-exec';

const execAsync = promisify(exec);

/**
 * 快速获取当前 WiFi SSID（轻量级方法，不获取详细信息）
 */
export async function probeCurrentSsid(
  platform: NodeJS.Platform,
  logger: Logger
): Promise<string | null> {
  try {
    switch (platform) {
      case 'darwin':
        return await getMacOSSsid(logger);
      case 'win32':
        return await getWindowsSsid(logger);
      default:
        logger.warn(`[WiFi检测] 不支持的平台: ${platform}`);
        return null;
    }
  } catch (error) {
    logger.error('[WiFi检测] 获取SSID失败', error);
    return null;
  }
}

/**
 * macOS: 快速获取 SSID
 * 优先使用 airport 命令（更可靠），备用 networksetup
 */
async function getMacOSSsid(logger: Logger): Promise<string | null> {
  try {
    // 方法1: 使用 airport 命令（更可靠）
    const airportPath =
      '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport';
    try {
      const { stdout } = await execAsync(`${airportPath} -I`, {
        timeout: 2000,
      });

      // 解析 airport 输出，查找 SSID
      const ssidMatch = stdout.match(/^\s*SSID:\s*(.+)$/m);
      if (ssidMatch && ssidMatch[1] && ssidMatch[1].trim() !== '') {
        const ssid = ssidMatch[1].trim();
        logger.debug(`[WiFi检测] airport获取到SSID: ${ssid}`);
        return ssid;
      }
    } catch (airportError) {
      // airport 失败，继续尝试其他方法
      const errorMsg = airportError instanceof Error ? airportError.message : String(airportError);
      logger.debug(`[WiFi检测] airport命令失败: ${errorMsg}`);
    }

    // 方法2: 使用 networksetup 作为备用
    try {
      const { stdout } = await execAsync('networksetup -getairportnetwork en0', {
        timeout: 2000,
      });

      const match = stdout.match(/Current Wi-Fi Network:\s*(.+)/);
      if (match && match[1]) {
        const ssid = match[1].trim();
        logger.debug(`[WiFi检测] networksetup获取到SSID: ${ssid}`);
        return ssid;
      }

      // 如果没有匹配到，说明未连接WiFi
      logger.debug(`[WiFi检测] 未连接WiFi，networksetup输出: ${stdout.trim()}`);
      return null;
    } catch (nsError) {
      const errorMsg = nsError instanceof Error ? nsError.message : String(nsError);
      logger.debug(`[WiFi检测] networksetup命令也失败: ${errorMsg}`);
      return null;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.debug(`[WiFi检测] 获取SSID异常: ${errorMsg}`);
    return null;
  }
}

/**
 * Windows: 快速获取 SSID（GBK 解码 + 已连接块优先解析，与 wifi-detector 共用逻辑）
 */
async function getWindowsSsid(_logger: Logger): Promise<string | null> {
  try {
    const stdout = await execWindowsText('netsh wlan show interfaces', 2000);
    return parseNetshSsid(stdout);
  } catch {
    return null;
  }
}
