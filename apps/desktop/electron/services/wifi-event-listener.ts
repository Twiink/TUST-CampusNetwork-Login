/**
 * WiFi 事件监听服务
 * 监听系统 WiFi 状态变化（连接/断开），自动触发网络状态更新
 *
 * 支持平台：
 * - macOS: 使用 networksetup 轮询检测（system_profiler 太慢）
 * - Windows: 使用 netsh wlan show interfaces 轮询检测
 *
 * 注意：这里使用轻量级轮询（仅检测 SSID 变化），不是完整的网络状态轮询
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { BrowserWindow } from 'electron';
import type { NetworkDetector, Logger, WifiManager } from '@repo/shared';
import type { WifiSwitcherService } from './wifi-switcher';

const execAsync = promisify(exec);

export interface WifiEventListenerOptions {
  /** 检测间隔（毫秒），默认 3000ms (3秒) */
  checkInterval?: number;
  /** 网络检测器实例 */
  networkDetector: NetworkDetector;
  /** 日志记录器 */
  logger: Logger;
  /** 主窗口实例（用于发送 IPC 事件） */
  window: BrowserWindow | null;
  /** WiFi管理器（可选） */
  wifiManager?: WifiManager;
  /** WiFi切换服务（可选） */
  wifiSwitcherService?: WifiSwitcherService;
}

/**
 * WiFi 事件监听器类
 */
export class WifiEventListener {
  private platform: NodeJS.Platform;
  private checkInterval: number;
  private networkDetector: NetworkDetector;
  private logger: Logger;
  private window: BrowserWindow | null;
  private wifiManager?: WifiManager;
  private wifiSwitcherService?: WifiSwitcherService;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSsid: string | null = null;
  private isRunning = false;
  private isReconnecting = false; // 防止重复重连

  constructor(options: WifiEventListenerOptions) {
    this.platform = process.platform;
    this.checkInterval = options.checkInterval || 3000;
    this.networkDetector = options.networkDetector;
    this.logger = options.logger;
    this.window = options.window;
    this.wifiManager = options.wifiManager;
    this.wifiSwitcherService = options.wifiSwitcherService;
  }

  /**
   * 启动 WiFi 事件监听
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('WiFi 事件监听器已在运行');
      return;
    }

    this.isRunning = true;
    this.logger.info('===== WiFi 事件监听器启动 =====');
    this.logger.info(`平台: ${this.platform}`);
    this.logger.info(`检测间隔: ${this.checkInterval}ms`);

    // 立即执行一次检测，获取初始状态
    this.logger.info('执行初始 WiFi 状态检测...');
    this.checkWifiChange().catch((error) => {
      this.logger.error('初始 WiFi 状态检测失败', error);
    });

    // 启动定时检测
    this.timer = setInterval(async () => {
      try {
        await this.checkWifiChange();
      } catch (error) {
        this.logger.error('WiFi 状态检测失败', error);
      }
    }, this.checkInterval);

    this.logger.info(`WiFi 事件监听器已启动，检测间隔: ${this.checkInterval}ms`);
  }

  /**
   * 停止 WiFi 事件监听
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.isRunning = false;
    this.lastSsid = null;
    this.logger.info('WiFi 事件监听器已停止');
  }

  /**
   * 更新窗口引用
   */
  setWindow(window: BrowserWindow | null): void {
    this.window = window;
  }

  /**
   * 检测 WiFi 状态变化
   */
  private async checkWifiChange(): Promise<void> {
    try {
      // 使用轻量级方法快速获取当前 SSID
      const currentSsid = await this.getCurrentSsid();

      // 检测 SSID 是否发生变化
      if (currentSsid !== this.lastSsid) {
        const prevSsid = this.lastSsid;
        this.lastSsid = currentSsid;

        // 记录变化
        if (prevSsid === null && currentSsid) {
          this.logger.info(`WiFi 已连接: ${currentSsid}`);
        } else if (prevSsid && currentSsid === null) {
          this.logger.info(`WiFi 已断开: ${prevSsid}`);

          // WiFi断开时尝试自动重连
          await this.handleWifiDisconnect(prevSsid);
        } else if (prevSsid && currentSsid) {
          this.logger.info(`WiFi 已切换: ${prevSsid} → ${currentSsid}`);
        }

        // 触发网络状态更新
        await this.notifyNetworkStatusChange();
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {
      // 静默处理错误，避免日志过多
    }
  }

  /**
   * 处理WiFi断开事件 - 尝试自动重连
   */
  private async handleWifiDisconnect(disconnectedSsid: string): Promise<void> {
    // 如果正在重连或没有配置WiFi管理器和切换服务，则跳过
    if (this.isReconnecting || !this.wifiManager || !this.wifiSwitcherService) {
      return;
    }

    // 检查断开的WiFi是否在配置列表中
    const wifiConfig = this.wifiManager.getWifiBySsid(disconnectedSsid);
    if (!wifiConfig || !wifiConfig.autoConnect) {
      this.logger.debug(`WiFi ${disconnectedSsid} 未配置自动重连，跳过`);
      return;
    }

    this.isReconnecting = true;
    this.logger.info(`===== 开始WiFi自动重连 =====`);
    console.log(`[WiFi-AutoReconnect] Starting reconnection attempt`, {
      ssid: disconnectedSsid,
      requiresAuth: wifiConfig.requiresAuth,
      timestamp: new Date().toISOString(),
    });

    try {
      // 等待一小段时间，避免立即重连
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 尝试重新连接到断开的WiFi
      this.logger.info(`尝试重连到: ${disconnectedSsid}`);
      const success = await this.wifiSwitcherService.connectToConfiguredNetwork(disconnectedSsid);

      if (success) {
        this.logger.success(`WiFi自动重连成功: ${disconnectedSsid}`);
        console.log(`[WiFi-AutoReconnect] Reconnection successful:`, disconnectedSsid);

        // 等待WiFi连接稳定后更新网络状态
        await new Promise(resolve => setTimeout(resolve, 3000));
        await this.notifyNetworkStatusChange();
      } else {
        this.logger.warn(`WiFi自动重连失败: ${disconnectedSsid}`);
        console.error(`[WiFi-AutoReconnect] Reconnection failed (returned false):`, disconnectedSsid);
      }
    } catch (error) {
      // 终端输出详细错误信息
      console.error(`[WiFi-AutoReconnect] Reconnection exception:`, {
        ssid: disconnectedSsid,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.name : 'Unknown',
        errorStack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      // 应用内日志保持简洁
      this.logger.error(`WiFi自动重连失败: ${disconnectedSsid}`);
    } finally {
      this.isReconnecting = false;
      this.logger.info(`===== WiFi自动重连流程结束 =====`);
    }
  }

  /**
   * 快速获取当前 WiFi SSID（轻量级方法，不获取详细信息）
   */
  private async getCurrentSsid(): Promise<string | null> {
    try {
      switch (this.platform) {
        case 'darwin':
          return await this.getMacOSSsid();
        case 'win32':
          return await this.getWindowsSsid();
        default:
          this.logger.warn(`[WiFi检测] 不支持的平台: ${this.platform}`);
          return null;
      }
    } catch (error) {
      this.logger.error('[WiFi检测] 获取SSID失败', error);
      return null;
    }
  }

  /**
   * macOS: 快速获取 SSID
   */
  private async getMacOSSsid(): Promise<string | null> {
    try {
      // 优先使用 networksetup（速度快）
      const { stdout } = await execAsync('networksetup -getairportnetwork en0', {
        timeout: 2000,
      });

      const match = stdout.match(/Current Wi-Fi Network:\s*(.+)/);
      if (match && match[1]) {
        return match[1].trim();
      }

      // 备选方案：使用 system_profiler
      return await this.getMacOSSsidFallback();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {
      return await this.getMacOSSsidFallback();
    }
  }

  /**
   * macOS: 备选方法 - 使用 system_profiler 获取 SSID
   */
  private async getMacOSSsidFallback(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('system_profiler SPAirPortDataType 2>/dev/null', {
        timeout: 3000,
      });

      // 解析输出，查找第一个 "Current Network Information:" 后的 SSID
      const lines = stdout.split('\n');
      let foundCurrentNetwork = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 找到第一个 "Current Network Information:"
        if (line.includes('Current Network Information:') && !foundCurrentNetwork) {
          foundCurrentNetwork = true;

          // 下一行应该是 SSID（格式: "            SSID_NAME:"）
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            const ssidMatch = nextLine.match(/^([^:]+):$/);

            if (ssidMatch && ssidMatch[1]) {
              return ssidMatch[1].trim();
            }
          }
          break; // 只处理第一个匹配
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {
      // 忽略错误
    }
    return null;
  }

  /**
   * Windows: 快速获取 SSID
   */
  private async getWindowsSsid(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('netsh wlan show interfaces', {
        timeout: 2000,
      });

      const match = stdout.match(/^\s*SSID\s*:\s*(.+)$/m);
      if (match && match[1]) {
        const ssid = match[1].trim();
        if (ssid) {
          return ssid;
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {
      // 忽略错误
    }
    return null;
  }

  /**
   * 通知网络状态变化
   */
  private async notifyNetworkStatusChange(): Promise<void> {
    try {
      // 检查窗口是否有效
      if (!this.window || this.window.isDestroyed()) {
        this.logger.warn('窗口无效或已销毁，无法发送网络状态更新');
        return;
      }

      // 立即发送 loading 状态，让 UI 显示加载动画
      this.window.webContents.send('event:network:statusLoading', {
        loading: true,
        wifiConnected: this.lastSsid !== null,
        ssid: this.lastSsid,
      });

      // 如果是 WiFi 连接变化，等待更长时间让网络接口完全初始化
      // WiFi 断开时不需要等待太久
      const delay = this.lastSsid !== null ? 1000 : 200;
      await new Promise((resolve) => setTimeout(resolve, delay));

      // 获取完整的网络状态
      this.logger.info('正在获取完整的网络状态信息...');
      const networkStatus = await this.networkDetector.getNetworkStatus();
      this.logger.success('网络状态获取成功', {
        wifiConnected: networkStatus.wifiConnected,
        ssid: networkStatus.ssid,
        connected: networkStatus.connected,
        authenticated: networkStatus.authenticated,
      });

      // 发送完整网络状态到渲染进程
      this.window.webContents.send('event:network:statusChanged', networkStatus);
    } catch (error) {
      this.logger.error('获取或发送网络状态失败', error);
    }
  }

  /**
   * 检查是否正在运行
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

/**
 * 创建 WiFi 事件监听器实例
 */
export function createWifiEventListener(options: WifiEventListenerOptions): WifiEventListener {
  return new WifiEventListener(options);
}
