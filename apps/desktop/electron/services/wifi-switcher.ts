/**
 * WiFi 切换服务
 * 提供 WiFi 扫描和切换功能（跨平台）
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface AvailableNetwork {
  ssid: string;
  signal: number;
  security: string;
}

/**
 * 获取可用的 WiFi 网络列表
 */
export async function scanAvailableNetworks(): Promise<AvailableNetwork[]> {
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
  try {
    // 使用 airport 命令扫描
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
    return [];
  }
}

/**
 * Windows: 扫描可用 WiFi 网络
 */
async function scanWindows(): Promise<AvailableNetwork[]> {
  try {
    const { stdout } = await execAsync('netsh wlan show networks mode=bssid', {
      timeout: 10000,
      encoding: 'buffer',
    });

    // Windows 可能使用 GBK 编码
    const text = stdout.toString('utf8');
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
    return [];
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
    return [];
  }
}

/**
 * 连接到指定 WiFi 网络
 * @param ssid WiFi SSID
 * @param password WiFi 密码（可选，如果未提供则尝试连接已保存的网络）
 */
export async function connectToNetwork(
  ssid: string,
  password?: string
): Promise<boolean> {
  switch (process.platform) {
    case 'darwin':
      return await connectMacOS(ssid, password);
    case 'win32':
      return await connectWindows(ssid, password);
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
    if (password) {
      await execAsync(`networksetup -setairportnetwork ${iface} "${ssid}" "${password}"`, {
        timeout: 30000,
      });
    } else {
      await execAsync(`networksetup -setairportnetwork ${iface} "${ssid}"`, {
        timeout: 30000,
      });
    }
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`连接失败: ${errorMessage}`);
  }
}

/**
 * Windows: 连接到 WiFi
 * @param ssid WiFi SSID
 * @param password WiFi密码
 */
async function connectWindows(
  ssid: string,
  password?: string
): Promise<boolean> {
  return await connectWindowsInternal(ssid, password);
}

/**
 * Windows: 连接到 WiFi 的内部实现
 * 仅使用Windows已保存的WiFi配置文件
 */
async function connectWindowsInternal(ssid: string, _password?: string): Promise<boolean> {
  try {
    // 检查是否已有保存的配置文件
    let hasProfile = false;
    try {
      const profileResult = await execAsync(`netsh wlan show profile name="${ssid}"`, {
        timeout: 3000,
      });
      hasProfile = profileResult.stdout.includes(ssid);
    } catch {
      hasProfile = false;
    }

    // 只使用已保存的配置文件连接
    if (hasProfile) {
      await execAsync(`netsh wlan connect name="${ssid}"`, {
        timeout: 30000,
      });
      return true;
    }

    // 没有配置文件，抛出错误提示用户手动连接
    throw new Error(`未找到WiFi配置文件。请先在Windows系统中手动连接一次WiFi "${ssid}"，之后应用可自动重连`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(errorMessage);
  }
}

/**
 * Linux: 连接到 WiFi
 */
async function connectLinux(ssid: string, password?: string): Promise<boolean> {
  try {
    if (password) {
      // 使用密码连接
      await execAsync(`nmcli dev wifi connect "${ssid}" password "${password}"`, {
        timeout: 30000,
      });
    } else {
      // 连接已保存的网络
      await execAsync(`nmcli dev wifi connect "${ssid}"`, {
        timeout: 30000,
      });
    }
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`连接失败: ${errorMessage}`);
  }
}

/**
 * WiFi 切换服务类
 */
export class WifiSwitcherService {
  private configuredNetworks: Array<{ ssid: string; password: string; priority: number }> = [];

  /**
   * 设置已配置的网络列表（按优先级排序）
   * @param networks WiFi配置列表（包含SSID、密码和优先级）
   */
  setConfiguredNetworks(
    networks: Array<{ ssid: string; password: string; priority: number }>
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
  ): Promise<{ ssid: string; password: string } | null> {
    const availableNetworks = await scanAvailableNetworks();
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
        };
      }
    }

    // 如果没找到，从头开始查找（不包括当前网络）
    for (let i = 0; i < currentIndex; i++) {
      if (availableSsids.has(this.configuredNetworks[i].ssid)) {
        return {
          ssid: this.configuredNetworks[i].ssid,
          password: this.configuredNetworks[i].password,
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

    const connected = await connectToNetwork(nextNetwork.ssid, nextNetwork.password);
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

    return await connectToNetwork(network.ssid, network.password);
  }
}

/**
 * 创建 WiFi 切换服务实例
 */
export function createWifiSwitcherService(): WifiSwitcherService {
  return new WifiSwitcherService();
}
