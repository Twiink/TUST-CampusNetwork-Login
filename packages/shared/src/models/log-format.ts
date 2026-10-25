/**
 * 日志导出格式化(自 Logger 抽出):系统信息文本块与单条日志文本行。
 */

import type { LogEntry, SystemInfo } from '../types/log';

/**
 * 格式化系统信息为文本
 */
export function formatSystemInfoText(systemInfo: SystemInfo): string {
  const lines: string[] = [];
  lines.push('--- 系统信息 ---');
  lines.push(
    `操作系统: ${systemInfo.os.platform} ${systemInfo.os.release} (${systemInfo.os.arch})`
  );
  lines.push(`应用版本: ${systemInfo.app.version}`);
  lines.push(
    `Electron: ${systemInfo.app.electronVersion} | Node: ${systemInfo.app.nodeVersion} | Chrome: ${systemInfo.app.chromeVersion}`
  );
  lines.push(`CPU: ${systemInfo.hardware.cpuModel} (${systemInfo.hardware.cpuCores}核)`);
  lines.push(
    `内存: ${systemInfo.hardware.totalMemoryMB}MB 总计 / ${systemInfo.hardware.freeMemoryMB}MB 可用`
  );

  const netParts: string[] = [];
  if (systemInfo.network.interface) netParts.push(systemInfo.network.interface);
  if (systemInfo.network.ipv4) netParts.push(`IPv4: ${systemInfo.network.ipv4}`);
  if (systemInfo.network.mac) netParts.push(`MAC: ${systemInfo.network.mac}`);
  if (systemInfo.network.wifiSSID) netParts.push(`WiFi: ${systemInfo.network.wifiSSID}`);
  if (netParts.length > 0) {
    lines.push(`网络: ${netParts.join(' | ')}`);
  }

  return lines.join('\n');
}

/**
 * 格式化单条日志为文本行
 */
export function formatLogLine(log: LogEntry): string {
  const timestamp =
    log.timestamp instanceof Date ? log.timestamp.toISOString() : String(log.timestamp);
  const level = log.level.toUpperCase().padEnd(7);
  const category = (log.category || 'general').padEnd(8);
  const source = log.source ? `[${log.source}] ` : '';
  const data = log.data ? ` | ${JSON.stringify(log.data)}` : '';
  return `[${timestamp}] [${level}] [${category}] ${source}${log.message}${data}`;
}
