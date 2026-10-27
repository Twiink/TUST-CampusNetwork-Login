import { runtimePorts } from '../runtime-ports';
import * as native from '@repo/native';
/**
 * WiFi 切换服务
 * 提供 WiFi 扫描和切换功能（跨平台）
 */

import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { createDesktopWifiAdapter } from './wifi-adapter';
import { execWindowsText, execWindowsFileText } from '../utils/win-exec';

const execAsync = promisify(exec);
// 连接命令的参数含用户配置的 SSID/密码，统一走 execFile 参数数组，不经 shell，杜绝注入
const execFileAsync = promisify(execFile);

export interface AvailableNetwork {
  ssid: string;
  signal: number;
  security: string;
}

/**
 * 获取可用的 WiFi 网络列表
 */
export async function scanAvailableNetworks(): Promise<AvailableNetwork[]> {
  if (runtimePorts.scan) return runtimePorts.scan();
  switch (process.platform) {
    case 'darwin':
      return await scanMacOS();
    case 'win32':
      return await scanWindows();
    case 'linux':
      return await scanLinux();
    default:
      return [];
  }
}

/**
 * macOS: 扫描可用 WiFi 网络
 */
async function scanMacOS(): Promise<AvailableNetwork[]> {
  if (native.scanWifi) {
    const networks = await native.scanWifi();
    return networks
      .filter((network) => network.ssid)
      .map((network) => ({
        ssid: network.ssid!,
        signal: Math.max(0, Math.min(100, Math.round((((network.rssi ?? -100) + 100) * 100) / 60))),
        security: network.security ?? 'Unknown',
      }));
  }
  try {
    // Compatibility fallback for older systems without the CoreWLAN module.
    const { stdout } = await execAsync(
      '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s',
      { timeout: 10000 }
    );

    const lines = stdout.trim().split('\n').slice(1); // 跳过标题行
    const networks: AvailableNetwork[] = [];

    for (const line of lines) {
      // 解析 airport 输出格式
      // SSID                             BSSID             RSSI CHANNEL HT CC SECURITY
      const match = line.match(/^\s*(.+?)\s+([0-9a-f:]+)\s+(-?\d+)\s+\d+/i);
      if (match) {
        const ssid = match[1].trim();
        const rssi = parseInt(match[3], 10);
        // 简化 signal 强度为 0-100
        const signal = Math.min(100, Math.max(0, rssi + 100));

        if (ssid && ssid !== '') {
          networks.push({
            ssid,
            signal,
            security: line.includes('WPA') ? 'WPA' : line.includes('WEP') ? 'WEP' : 'Open',
          });
        }
      }
    }

    return networks;
  } catch {
    throw new Error('WiFi 扫描失败，请检查系统权限和无线设备');
  }
}

/**
 * Windows: 扫描可用 WiFi 网络
 * 输出按 GBK 解码（中文系统「信号」「身份验证」等字段才可正确匹配）
 */
async function scanWindows(): Promise<AvailableNetwork[]> {
  try {
    const text = await execWindowsText('netsh wlan show networks mode=bssid');
    const networks: AvailableNetwork[] = [];

    // 解析 netsh 输出
    const blocks = text.split(/SSID\s+\d+\s*:/i);

    for (const block of blocks.slice(1)) {
      const ssidMatch = block.match(/^\s*(.+?)[\r\n]/);
      const signalMatch = block.match(/Signal\s*:\s*(\d+)%/i) || block.match(/信号\s*:\s*(\d+)%/);
      const authMatch =
        block.match(/Authentication\s*:\s*(.+?)[\r\n]/i) ||
        block.match(/身份验证\s*:\s*(.+?)[\r\n]/);

      if (ssidMatch) {
        const ssid = ssidMatch[1].trim();
        const signal = signalMatch ? parseInt(signalMatch[1], 10) : 0;
        const security = authMatch ? authMatch[1].trim() : 'Unknown';

        if (ssid && ssid !== '') {
          networks.push({ ssid, signal, security });
        }
      }
    }

    return networks;
  } catch {
    throw new Error('WiFi 扫描失败，请检查系统权限和无线设备');
  }
}

/**
 * Linux: 扫描可用 WiFi 网络
 */
async function scanLinux(): Promise<AvailableNetwork[]> {
  try {
    const { stdout } = await execAsync('nmcli -t -f SSID,SIGNAL,SECURITY dev wifi list', {
      timeout: 10000,
    });

    const networks: AvailableNetwork[] = [];
    const lines = stdout.trim().split('\n');

    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length >= 3) {
        const ssid = parts[0];
        const signal = parseInt(parts[1], 10) || 0;
        const security = parts[2] || 'Open';

        if (ssid && ssid !== '') {
          networks.push({ ssid, signal, security });
        }
      }
    }

    return networks;
  } catch {
    throw new Error('WiFi 扫描失败，请检查系统权限和无线设备');
  }
}

/**
 * 连接到指定 WiFi 网络
 * @param ssid WiFi SSID
 * @param password WiFi 密码（可选，如果未提供则尝试连接已保存的网络）
 */
export async function connectToNetwork(
  ssid: string,
  password?: string,
  security?: string,
  readConnection?: () => Promise<ConnectionSnapshot>
): Promise<boolean> {
  switch (process.platform) {
    case 'darwin':
      return await connectMacOS(ssid, password);
    case 'win32':
      return await connectWindowsInternal(ssid, password, security, readConnection);
    case 'linux':
      return await connectLinux(ssid, password);
    default:
      return false;
  }
}

/**
 * macOS: 连接到 WiFi
 */
async function connectMacOS(ssid: string, password?: string): Promise<boolean> {
  try {
    // 获取 WiFi 接口名称
    const { stdout: ifaceOutput } = await execAsync(
      "networksetup -listallhardwareports | grep -A1 Wi-Fi | grep Device | awk '{print $2}'"
    );
    const iface = ifaceOutput.trim() || 'en0';

    // 如果提供了密码，使用密码连接；否则尝试连接已保存的网络
    const connectArgs = ['-setairportnetwork', iface, ssid];
    if (password) {
      connectArgs.push(password);
    }
    await execFileAsync('networksetup', connectArgs, { timeout: 30000 });
    return true;
  } catch (error) {
    throw safeConnectionError(error);
  }
}

export interface ConnectionSnapshot {
  ssid?: string | null;
  connected: boolean;
  ip?: string | null;
}

export async function waitForTargetNetwork(
  ssid: string,
  read: () => Promise<ConnectionSnapshot>,
  timeoutMs = 30_000,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<boolean> {
  for (let elapsed = 0; elapsed <= timeoutMs; elapsed += 500) {
    const state = await read();
    const ip = state.ip?.split('%')[0];
    const usable =
      ip && isIP(ip) !== 0 && !/^(169\.254\.|127\.|0\.0\.0\.0$|fe80:|::$|::1$)/i.test(ip);
    if (state.connected && state.ssid === ssid && usable) return true;
    if (elapsed < timeoutMs) await sleep(500);
  }
  return false;
}

function safeConnectionError(error: unknown): Error {
  const code =
    error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
  return new Error(
    `连接失败（系统错误 ${/^[A-Z0-9_-]+$/i.test(code) ? code : 'UNKNOWN'}），请检查密码、信号及系统网络权限`
  );
}

const xml = (text: string) =>
  text.replace(
    /[<>&"']/g,
    (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!
  );
export function buildWindowsWifiProfile(
  ssid: string,
  password: string,
  security = ''
): { name: string; xml: string } {
  if (/enterprise|eap|企业/i.test(security)) throw new Error('企业认证网络请使用系统已保存的配置');
  const name = `NetMate-${createHash('sha256').update(ssid).digest('hex').slice(0, 16)}`;
  const authentication = !password ? 'open' : /WPA3|SAE/i.test(security) ? 'WPA3SAE' : 'WPA2PSK';
  const sharedKey = password
    ? `<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${xml(password)}</keyMaterial></sharedKey>`
    : '';
  return {
    name,
    xml: `<?xml version="1.0" encoding="UTF-8"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>${name}</name><SSIDConfig><SSID><hex>${Buffer.from(ssid, 'utf8').toString('hex')}</hex><name>${xml(ssid)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>manual</connectionMode><MSM><security><authEncryption><authentication>${authentication}</authentication><encryption>${password ? 'AES' : 'none'}</encryption><useOneX>false</useOneX></authEncryption>${sharedKey}</security></MSM></WLANProfile>`,
  };
}

async function readConnectionSnapshot(): Promise<ConnectionSnapshot> {
  const adapter = createDesktopWifiAdapter();
  const wifi = await adapter.getCurrentWifi();
  if (!wifi?.connected) return { connected: false };
  const info = await adapter.getNetworkInfo();
  return { connected: true, ssid: wifi.ssid, ip: info.ipv4 || info.ipv6 };
}

async function connectWindowsInternal(
  ssid: string,
  password?: string,
  security?: string,
  read = readConnectionSnapshot
): Promise<boolean> {
  let temporaryDirectory: string | undefined;
  try {
    let profileName = ssid;
    let existing = false;
    try {
      existing = (
        await execWindowsFileText('netsh', ['wlan', 'show', 'profile', `name=${ssid}`], 3000)
      ).includes(ssid);
    } catch {
      /* New network. */
    }
    if (/enterprise|eap|企业|WEP/i.test(security ?? '')) {
      if (!existing) throw new Error('需要系统已保存的网络配置');
    } else if (!existing || password !== undefined) {
      const profile = buildWindowsWifiProfile(ssid, password ?? '', security);
      temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'netmate-wlan-'));
      const file = path.join(temporaryDirectory, 'profile.xml');
      await writeFile(file, profile.xml, { mode: 0o600 });
      await execFileAsync('netsh', ['wlan', 'add', 'profile', `filename=${file}`, 'user=current'], {
        timeout: 10000,
        windowsHide: true,
      });
      profileName = profile.name;
    }
    await execFileAsync('netsh', ['wlan', 'connect', `name=${profileName}`, `ssid=${ssid}`], {
      timeout: 30000,
      windowsHide: true,
    });
    return await waitForTargetNetwork(ssid, read);
  } catch (error) {
    throw safeConnectionError(error);
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function isWifiRadioEnabled(): Promise<boolean> {
  try {
    if (process.platform === 'linux') {
      const { stdout } = await execFileAsync('nmcli', ['radio', 'wifi'], {
        timeout: 3000,
        env: { ...process.env, LC_ALL: 'C' },
      });
      return stdout.trim() === 'enabled';
    }
    if (process.platform === 'win32') {
      const output = await execWindowsText('netsh wlan show interfaces', 3000);
      return !/Software Off|软件 关闭|软件关|无线接口.*不存在|no wireless interface/i.test(output);
    }
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('networksetup', ['-getairportpower', 'en0'], {
        timeout: 3000,
      });
      return /: On/i.test(stdout);
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Linux: 连接到 WiFi
 */
async function connectLinux(ssid: string, password?: string): Promise<boolean> {
  try {
    const connectArgs = ['dev', 'wifi', 'connect', ssid];
    if (password) {
      // 使用密码连接
      connectArgs.push('password', password);
    }
    await execFileAsync('nmcli', connectArgs, { timeout: 30000 });
    return true;
  } catch (error) {
    throw safeConnectionError(error);
  }
}

/**
 * WiFi 切换服务类
 */
export class WifiSwitcherService {
  async scan(): Promise<AvailableNetwork[]> {
    return (this.ports.scan ?? scanAvailableNetworks)();
  }

  constructor(
    private ports: { scan?: typeof scanAvailableNetworks; connect?: typeof connectToNetwork } = {}
  ) {}
  private configuredNetworks: Array<{
    ssid: string;
    password: string;
    priority: number;
    security?: string;
  }> = [];

  /**
   * 设置已配置的网络列表（按优先级排序）
   * @param networks WiFi配置列表（包含SSID、密码和优先级）
   */
  setConfiguredNetworks(
    networks: Array<{ ssid: string; password: string; priority: number; security?: string }>
  ): void {
    // 按优先级排序（数字越小优先级越高）
    this.configuredNetworks = networks.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 获取下一个可用的 WiFi 网络
   * @param currentSsid 当前连接的 SSID
   */
  async getNextAvailableNetwork(
    currentSsid: string | null
  ): Promise<{ ssid: string; password: string; security?: string } | null> {
    const availableNetworks = await (this.ports.scan ?? scanAvailableNetworks)();
    const availableSsids = new Set(availableNetworks.map((n) => n.ssid));

    // 找到当前网络在配置列表中的位置
    const currentIndex = currentSsid
      ? this.configuredNetworks.findIndex((n) => n.ssid === currentSsid)
      : -1;

    // 从下一个位置开始查找可用的网络
    for (let i = currentIndex + 1; i < this.configuredNetworks.length; i++) {
      if (availableSsids.has(this.configuredNetworks[i].ssid)) {
        return {
          ssid: this.configuredNetworks[i].ssid,
          password: this.configuredNetworks[i].password,
          security: this.configuredNetworks[i].security,
        };
      }
    }

    // 如果没找到，从头开始查找（不包括当前网络）
    for (let i = 0; i < currentIndex; i++) {
      if (availableSsids.has(this.configuredNetworks[i].ssid)) {
        return {
          ssid: this.configuredNetworks[i].ssid,
          password: this.configuredNetworks[i].password,
          security: this.configuredNetworks[i].security,
        };
      }
    }

    return null;
  }

  /**
   * 尝试切换到下一个可用网络
   */
  async switchToNextNetwork(
    currentSsid: string | null
  ): Promise<{ success: boolean; ssid: string | null }> {
    const nextNetwork = await this.getNextAvailableNetwork(currentSsid);

    if (!nextNetwork) {
      return { success: false, ssid: null };
    }

    const connected = await (this.ports.connect ?? connectToNetwork)(
      nextNetwork.ssid,
      nextNetwork.password,
      nextNetwork.security
    );
    return { success: connected, ssid: connected ? nextNetwork.ssid : null };
  }

  /**
   * 连接到指定的WiFi配置
   * @param ssid WiFi SSID
   * @throws 抛出包含详细错误信息的 Error
   */
  async connectToConfiguredNetwork(ssid: string): Promise<boolean> {
    const network = this.configuredNetworks.find((n) => n.ssid === ssid);
    if (!network) {
      throw new Error(`未找到WiFi配置: ${ssid}`);
    }

    return await (this.ports.connect ?? connectToNetwork)(
      network.ssid,
      network.password,
      network.security
    );
  }
}

/**
 * 创建 WiFi 切换服务实例
 */
export function createWifiSwitcherService(): WifiSwitcherService {
  return new WifiSwitcherService();
}
