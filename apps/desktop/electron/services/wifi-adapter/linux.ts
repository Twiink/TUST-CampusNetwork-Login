import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { WifiInfo, NetworkInfo } from '@repo/shared';
import { devLog } from '../../utils/dev-log';

const execFileAsync = promisify(execFile);

interface NmcliRow {
  fields: string[];
}

export function splitNmcliLine(line: string): string[] {
  const fields: string[] = [];
  let escaped = false;
  let current = '';

  for (const char of line) {
    if (char === '\\' && !escaped) {
      escaped = true;
      continue;
    }
    if (char === ':' && !escaped) {
      fields.push(current);
      current = '';
    } else {
      if (escaped && char !== ':' && char !== '\\') {
        current += '\\';
      }
      current += char;
    }
    escaped = false;
  }
  fields.push(current);
  return fields;
}

export function parseWifiRows(stdout: string): NmcliRow[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ fields: splitNmcliLine(line) }));
}

export async function resolveLinuxWifiInfo(): Promise<WifiInfo | null> {
  try {
    // nmcli terse 输出转义冒号，避免 SSID 含冒号时被拆错字段。
    const { stdout } = await execFileAsync(
      'nmcli',
      ['-t', '-f', 'ACTIVE,SSID,SIGNAL,RATE,CHAN,FREQ,SECURITY,BSSID', 'dev', 'wifi'],
      { timeout: 3000 }
    );
    const active = parseWifiRows(stdout).find((row) => row.fields[0] === 'yes');
    if (!active) {
      return null;
    }

    const [, ssid, signalText, rateText, channelText, frequencyText, security, bssid] =
      active.fields;
    if (!ssid) {
      return null;
    }

    const channel = parseInt(channelText, 10) || 0;
    const frequencyMhz = parseInt(frequencyText, 10) || 0;
    return {
      ssid,
      bssid: bssid || undefined,
      signalStrength: parseInt(signalText, 10) || 0,
      linkSpeed: parseFloat(rateText) || 0,
      frequency: frequencyMhz || (channel > 14 ? 5000 : channel > 0 ? 2400 : 0),
      channel: channel || undefined,
      security: security && security !== '--' ? security : undefined,
      connected: true,
    };
  } catch (error) {
    devLog.info('nmcli wifi probe failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function resolveLinuxNetworkInfo(): Promise<NetworkInfo> {
  try {
    const { stdout } = await execFileAsync(
      'nmcli',
      [
        '-t',
        '-f',
        'GENERAL.TYPE,IP4.ADDRESS,IP6.ADDRESS,IP4.GATEWAY,IP4.DNS,GENERAL.HWADDR',
        'dev',
        'show',
      ],
      { timeout: 3000 }
    );

    const info: NetworkInfo = {};
    const addresses: string[] = [];
    const dns: string[] = [];

    const wifiBlock = stdout
      .split(/\r?\n\s*\r?\n/)
      .find((block) => /^GENERAL\.TYPE:(?:wifi|802-11-wireless)$/m.test(block.trim()));
    if (!wifiBlock) return {};
    for (const rawLine of wifiBlock.split('\n')) {
      const [key = '', value = ''] = splitNmcliLine(rawLine.trim());
      const normalizedKey = key.toUpperCase();
      if (/^IP4\.ADDRESS(?:\[\d+\])?$/.test(normalizedKey)) {
        const [address, prefix] = value.split('/');
        if (address) {
          info.ipv4 = info.ipv4 ?? address;
          if (prefix) {
            const bits = Number.parseInt(prefix, 10);
            const mask = Number.isFinite(bits) && bits > 0 && bits <= 32 ? ~0 << (32 - bits) : 0;
            info.subnetMask =
              info.subnetMask ??
              [(mask >>> 24) & 255, (mask >>> 16) & 255, (mask >>> 8) & 255, mask & 255].join('.');
          }
          addresses.push(address);
        }
      } else if (/^IP6\.ADDRESS(?:\[\d+\])?$/.test(normalizedKey)) {
        const address = value.split('/')[0];
        if (address && !address.startsWith('fe80:')) info.ipv6 ??= address;
      } else if (normalizedKey === 'IP4.GATEWAY') {
        info.gateway = info.gateway || value || undefined;
      } else if (/^IP4\.DNS(?:\[\d+\])?$/.test(normalizedKey)) {
        if (value && !dns.includes(value)) {
          dns.push(value);
        }
      } else if (normalizedKey === 'GENERAL.HWADDR') {
        info.mac = info.mac || value || undefined;
      }
    }

    if (dns.length > 0) {
      info.dns = dns;
    }
    if (!info.ipv4 && addresses.length > 0) {
      info.ipv4 = addresses[0];
    }
    return info;
  } catch (error) {
    devLog.info('nmcli network info failed:', error instanceof Error ? error.message : error);
    return {};
  }
}
