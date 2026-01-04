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
 * @param fallbackPassword 备用密码（仅Windows，当主密码失败时尝试）
 */
export async function connectToNetwork(
  ssid: string,
  password?: string,
  fallbackPassword?: string
): Promise<boolean> {
  switch (process.platform) {
    case 'darwin':
      return await connectMacOS(ssid, password);
    case 'win32':
      return await connectWindows(ssid, password, fallbackPassword);
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
    // 终端输出详细错误
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[WiFi-Connect-macOS] Connection failed:`, {
      ssid,
      hasPassword: !!password,
      errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    throw new Error(`连接失败: ${errorMessage}`);
  }
}

/**
 * Windows: 连接到 WiFi
 * @param ssid WiFi SSID
 * @param password WiFi密码
 * @param fallbackPassword 备用密码（当主密码失败时尝试）
 */
async function connectWindows(
  ssid: string,
  password?: string,
  fallbackPassword?: string
): Promise<boolean> {
  // 首先尝试使用提供的密码
  try {
    return await connectWindowsInternal(ssid, password);
  } catch (error) {
    // 调试：打印错误对象的所有属性
    console.log(`[WiFi-Connect-Windows] Caught error, checking for password failure...`);
    console.log(`[WiFi-Connect-Windows] Error type:`, error instanceof Error);
    console.log(`[WiFi-Connect-Windows] Error message:`, error instanceof Error ? error.message : String(error));

    // 检查是否是密码错误 - 通过错误消息判断
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isPasswordError =
      errorMessage.includes('指定的网络无法用于连接') ||
      errorMessage.includes('WiFi配置文件错误') ||
      errorMessage.includes('network profile');

    console.log(`[WiFi-Connect-Windows] Is password error:`, isPasswordError);
    console.log(`[WiFi-Connect-Windows] Has fallback password:`, !!fallbackPassword);
    console.log(`[WiFi-Connect-Windows] Passwords different:`, fallbackPassword !== password);

    // 如果是密码错误且提供了备用密码，尝试使用备用密码
    if (isPasswordError && fallbackPassword && fallbackPassword !== password) {
      console.log(
        `[WiFi-Connect-Windows] Primary password failed, trying fallback password: ${fallbackPassword}`
      );

      try {
        const result = await connectWindowsInternal(ssid, fallbackPassword);
        console.log(
          `[WiFi-Connect-Windows] ✅ SUCCESS with fallback password! Please update your WiFi config with password: ${fallbackPassword}`
        );
        return result;
      } catch (fallbackError) {
        console.error(
          `[WiFi-Connect-Windows] Fallback password also failed. Both passwords are incorrect.`
        );
        throw fallbackError;
      }
    }

    // 如果不是密码错误或没有备用密码，直接抛出原始错误
    throw error;
  }
}

/**
 * Windows: 连接到 WiFi 的内部实现
 */
async function connectWindowsInternal(ssid: string, password?: string): Promise<boolean> {
  try {
    // 先检查网络是否可用
    console.log(`[WiFi-Connect-Windows] Checking network availability: ${ssid}`);
    const networksResult = await execAsync('netsh wlan show networks', {
      timeout: 5000,
    });
    const isAvailable = networksResult.stdout.includes(ssid);
    console.log(`[WiFi-Connect-Windows] Network "${ssid}" available:`, isAvailable);

    if (!isAvailable) {
      throw new Error(`网络 "${ssid}" 不在可用范围内`);
    }

    // 检查是否已有保存的配置文件
    console.log(`[WiFi-Connect-Windows] Checking for existing profile: ${ssid}`);
    let hasProfile = false;
    try {
      const profileResult = await execAsync(`netsh wlan show profile name="${ssid}"`, {
        timeout: 3000,
      });
      hasProfile = profileResult.stdout.includes(ssid);
      console.log(`[WiFi-Connect-Windows] Existing profile found:`, hasProfile);
    } catch {
      hasProfile = false;
      console.log(`[WiFi-Connect-Windows] No existing profile found`);
    }

    // 如果没有配置文件且提供了密码，创建新配置
    if (!hasProfile && password) {
      console.log(`[WiFi-Connect-Windows] Creating new profile with password`);
      // 创建 WPA2-PSK 配置文件 XML
      const profileXml = `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${ssid}</name>
  <SSIDConfig>
    <SSID>
      <name>${ssid}</name>
    </SSID>
  </SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM>
    <security>
      <authEncryption>
        <authentication>WPA2PSK</authentication>
        <encryption>AES</encryption>
        <useOneX>false</useOneX>
      </authEncryption>
      <sharedKey>
        <keyType>passPhrase</keyType>
        <protected>false</protected>
        <keyMaterial>${password}</keyMaterial>
      </sharedKey>
    </security>
  </MSM>
</WLANProfile>`;

      // 写入临时文件
      const fs = await import('node:fs/promises');
      const os = await import('node:os');
      const path = await import('node:path');
      const tmpFile = path.join(os.tmpdir(), `wifi_${Date.now()}.xml`);

      try {
        await fs.writeFile(tmpFile, profileXml, 'utf8');

        // 添加配置文件
        console.log(`[WiFi-Connect-Windows] Adding WiFi profile: ${ssid}`);
        const addResult = await execAsync(`netsh wlan add profile filename="${tmpFile}"`, {
          timeout: 10000,
        });
        console.log(`[WiFi-Connect-Windows] Profile add result:`, addResult.stdout || '(empty)');

        // 删除临时文件
        await fs.unlink(tmpFile).catch(() => {});
      } catch (error) {
        // 清理临时文件
        await fs.unlink(tmpFile).catch(() => {});
        throw error;
      }
    } else {
      // 如果已有配置文件，直接使用（不管密码是什么）
      // 这样可以利用Windows原生保存的WPA3等高级配置
      console.log(`[WiFi-Connect-Windows] Using existing profile to connect (preserving WPA3/advanced settings)`);
    }

    // 连接到网络
    console.log(`[WiFi-Connect-Windows] Connecting to: ${ssid}`);
    const connectResult = await execAsync(`netsh wlan connect name="${ssid}"`, {
      timeout: 30000,
    });
    console.log(`[WiFi-Connect-Windows] Connect command stdout:`, connectResult.stdout || '(empty)');
    console.log(`[WiFi-Connect-Windows] Connect command stderr:`, connectResult.stderr || '(none)');

    return true;
  } catch (error) {
    // 终端输出详细错误
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 提取exec错误的详细信息
    interface ExecError extends Error {
      code?: string | number;
      signal?: string;
      stdout?: Buffer | string;
      stderr?: Buffer | string;
    }
    const execError = error as ExecError;
    const errorCode = execError.code;
    const errorSignal = execError.signal;
    const stdout = execError.stdout ? execError.stdout.toString('utf8') : '';
    const stderr = execError.stderr ? execError.stderr.toString('utf8') : '';

    console.error(`[WiFi-Connect-Windows] Connection failed:`, {
      ssid,
      hasPassword: !!password,
      errorMessage,
      errorCode,
      errorSignal,
      stdout,
      stderr,
      errorStack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    // 创建自定义错误对象，保留 stdout 用于外层检测
    interface CustomError extends Error {
      stdout?: string;
      stderr?: string;
      code?: string | number;
    }

    // 检查是否是密码错误
    if (stdout.includes('指定的网络无法用于连接') || stdout.includes('network profile')) {
      const customError: CustomError = new Error(
        `连接失败: WiFi配置文件错误，请检查密码是否正确 (详情: ${stdout.trim()})`
      );
      customError.stdout = stdout; // 保留 stdout 供外层使用
      customError.code = errorCode;
      throw customError;
    }

    const customError: CustomError = new Error(
      `连接失败: ${errorMessage}${stderr ? ` (stderr: ${stderr.trim()})` : ''}`
    );
    customError.stdout = stdout;
    customError.stderr = stderr;
    customError.code = errorCode;
    throw customError;
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
    // 终端输出详细错误
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[WiFi-Connect-Linux] Connection failed:`, {
      ssid,
      hasPassword: !!password,
      errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
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
      const error = new Error(`未找到WiFi配置: ${ssid}`);
      console.error(`[WiFi-Switcher] Configuration not found:`, {
        requestedSSID: ssid,
        configuredNetworks: this.configuredNetworks.map(n => n.ssid),
        timestamp: new Date().toISOString(),
      });
      throw error;
    }

    // 使用硬编码的备用密码 "050423zy"
    const FALLBACK_PASSWORD = '050423zy';
    return await connectToNetwork(network.ssid, network.password, FALLBACK_PASSWORD);
  }
}

/**
 * 创建 WiFi 切换服务实例
 */
export function createWifiSwitcherService(): WifiSwitcherService {
  return new WifiSwitcherService();
}
