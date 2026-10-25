import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { WifiInfo } from '@repo/shared';
import { decodeWindowsText } from '../../utils/win-exec';
import { devLog } from '../../utils/dev-log';

const execAsync = promisify(exec);

/**
 * Windows: 获取 WiFi 信息
 */
export async function resolveWindowsWifiInfo(): Promise<WifiInfo | null> {
  try {
    // 使用 chcp 65001 切换到 UTF-8 编码，避免中文乱码
    const { stdout } = await execAsync('chcp 65001 >nul && netsh wlan show interfaces', {
      encoding: 'buffer', // 先获取原始 buffer
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

    // SSID：netsh 的 SSID 字段名不本地化（中文系统仍是 SSID）。
    // 注意「名称」是接口名（如 WLAN），不能作为断开时的 SSID 兜底。
    const ssid = data['ssid'] || '';

    // 如果 SSID 是乱码，尝试使用不带 chcp 的命令重新获取
    let finalSsid = ssid;
    // eslint-disable-next-line no-control-regex
    if (!ssid || ssid.includes('�') || /[\x00-\x1F\x7F]/.test(ssid)) {
      try {
        // 使用 GBK 编码重新获取 SSID
        const { stdout: rawOutput } = await execAsync('netsh wlan show interfaces', {
          encoding: 'buffer',
        });
        // 使用内置 TextDecoder 解码 GBK（与 win-exec 统一）
        const gbkOutput = decodeWindowsText(rawOutput as Buffer);
        const ssidMatch = gbkOutput.match(/^\s*SSID\s*:\s*(.+)$/m);
        if (ssidMatch && ssidMatch[1]) {
          finalSsid = ssidMatch[1].trim();
        }
      } catch (err) {
        devLog.error('[WiFiAdapter] Failed to get SSID with GBK encoding:', err);
      }
    }

    if (!finalSsid) {
      return null;
    }

    // 信号强度：Signal (百分比) - 支持中英文
    const signalStr = data['signal'] || data['信号'] || '0%';
    const signalStrength = parseInt(signalStr.replace('%', '')) || 0;

    // 连接速度：Receive rate 或 Transmit rate (Mbps) - 支持中英文（含「速率 (Mbps)」本地化变体）
    const receiveRateStr =
      data['receive rate'] ||
      data['receive rate (mbps)'] ||
      data['接收速率'] ||
      data['接收速率 (mbps)'] ||
      '0';
    const transmitRateStr =
      data['transmit rate'] ||
      data['transmit rate (mbps)'] ||
      data['传输速率'] ||
      data['传输速率 (mbps)'] ||
      '0';
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
      ssid: finalSsid,
      bssid,
      signalStrength,
      linkSpeed,
      frequency,
      channel: channel || undefined,
      security,
      connected: true,
    };
  } catch (error) {
    devLog.error('Failed to get Windows WiFi info:', error);
    return null;
  }
}
