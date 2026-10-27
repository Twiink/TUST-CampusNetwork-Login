import { runtimePorts } from '../../runtime-ports';
/**
 * 轻量 SSID 探测：复用 wifi-detector 的 TTL 缓存，避免多个服务重复 spawn。
 */

import type { Logger } from '@repo/shared';
import { getCurrentWifiSSID } from '../wifi-detector';

export async function probeCurrentSsid(
  platform: NodeJS.Platform,
  logger: Logger
): Promise<string | null> {
  try {
    if (runtimePorts.wifi) return (await runtimePorts.wifi.getCurrentWifi())?.ssid ?? null;
    const status = await getCurrentWifiSSID();
    if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux') {
      logger.warn(`[WiFi检测] 不支持的平台: ${platform}`);
      return null;
    }
    return status.ssid;
  } catch (error) {
    logger.error('[WiFi检测] 获取SSID失败', error);
    return null;
  }
}
