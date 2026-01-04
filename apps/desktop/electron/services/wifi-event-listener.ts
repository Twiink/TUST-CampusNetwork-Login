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
import type { NetworkDetector, Logger, WifiManager, ConfigManager } from '@repo/shared';
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
  /** 配置管理器（可选，用于获取maxRetries等设置） */
  configManager?: ConfigManager;
}

/**
 * WiFi 重连进度事件
 */
export interface WifiReconnectProgress {
  ssid: string;
  attempt: number;
  maxAttempts: number;
  status: 'connecting' | 'failed' | 'success';
}

/**
 * WiFi 重连失败信息
 */
export interface WifiReconnectFailure {
  ssid: string;
  priority: number;
  reason: string;
}

/**
 * 所有 WiFi 重连失败事件
 */
export interface WifiAllReconnectsFailed {
  failedList: WifiReconnectFailure[];
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
  private configManager?: ConfigManager;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSsid: string | null = null;
  private isRunning = false;
  private isReconnecting = false; // 防止重复重连
  private lastErrorLogged = false; // 防止错误日志过多

  constructor(options: WifiEventListenerOptions) {
    this.platform = process.platform;
    this.checkInterval = options.checkInterval || 3000;
    this.networkDetector = options.networkDetector;
    this.logger = options.logger;
    this.window = options.window;
    this.wifiManager = options.wifiManager;
    this.wifiSwitcherService = options.wifiSwitcherService;
    this.configManager = options.configManager;
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

      // 重置错误标志（成功获取到SSID）
      if (this.lastErrorLogged) {
        this.lastErrorLogged = false;
        this.logger.info('WiFi 状态检测已恢复正常');
      }

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
    } catch (error) {
      // 只记录一次错误，避免日志过多
      if (!this.lastErrorLogged) {
        this.logger.error('WiFi 状态检测失败', error);
        this.lastErrorLogged = true;
      }
    }
  }

  /**
   * 处理WiFi断开事件 - 尝试自动重连
   * 实现三阶段重连流程：
   * 1. 单个WiFi重连（重试N次）
   * 2. 优先级切换（按优先级尝试其他WiFi）
   * 3. 所有WiFi失败（停止重连，显示失败列表）
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
    this.logger.info(`===== 开始WiFi自动重连流程 =====`);
    this.logger.info(`断开的WiFi: ${disconnectedSsid} (优先级: ${wifiConfig.priority})`);

    // 获取最大重试次数（默认3次）
    const maxRetries = this.configManager?.getConfig()?.settings.maxRetries || 3;
    this.logger.info(`最大重试次数: ${maxRetries}`);

    // 获取所有启用自动重连的WiFi，按优先级排序
    const allWifiConfigs = this.wifiManager.getWifiConfigs()
      .filter((w: { autoConnect: boolean }) => w.autoConnect)
      .sort((a: { priority: number }, b: { priority: number }) => a.priority - b.priority);

    // 跟踪所有失败的WiFi
    const failedList: WifiReconnectFailure[] = [];

    try {
      // 阶段1：尝试重连到断开的WiFi
      this.logger.info(`----- 阶段1：尝试重连到断开的WiFi -----`);
      const reconnectSuccess = await this.retryConnectToWifi(
        disconnectedSsid,
        wifiConfig.priority,
        maxRetries,
        failedList
      );

      if (reconnectSuccess) {
        this.logger.success(`WiFi自动重连成功: ${disconnectedSsid}`);
        await this.finalizeSuccessfulReconnect();
        return;
      }

      // 阶段2：按优先级切换到其他WiFi
      this.logger.info(`----- 阶段2：按优先级尝试其他WiFi -----`);
      for (const wifi of allWifiConfigs) {
        // 跳过已经尝试过的WiFi
        if (wifi.ssid === disconnectedSsid) {
          continue;
        }

        this.logger.info(`切换到下一个WiFi: ${wifi.ssid} (优先级: ${wifi.priority})`);

        // 等待1秒后尝试连接下一个WiFi
        await new Promise(resolve => setTimeout(resolve, 1000));

        const success = await this.retryConnectToWifi(
          wifi.ssid,
          wifi.priority,
          maxRetries,
          failedList
        );

        if (success) {
          this.logger.success(`成功切换到WiFi: ${wifi.ssid}`);
          await this.finalizeSuccessfulReconnect();
          return;
        }
      }

      // 阶段3：所有WiFi都失败
      this.logger.error(`----- 阶段3：所有WiFi连接失败 -----`);
      this.logger.error(`失败的WiFi数量: ${failedList.length}`);
      for (const failed of failedList) {
        this.logger.error(`  - ${failed.ssid} (优先级 ${failed.priority}): ${failed.reason}`);
      }

      // 广播所有WiFi失败事件到UI
      this.broadcastAllWifiFailed(failedList);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`WiFi自动重连流程异常: ${errorMessage}`);
    } finally {
      this.isReconnecting = false;
      this.logger.info(`===== WiFi自动重连流程结束 =====`);
    }
  }

  /**
   * 重试连接到指定WiFi（带重试次数）
   * @param ssid WiFi名称
   * @param priority WiFi优先级
   * @param maxRetries 最大重试次数
   * @param failedList 失败列表（用于记录失败信息）
   * @returns 是否连接成功
   */
  private async retryConnectToWifi(
    ssid: string,
    priority: number,
    maxRetries: number,
    failedList: WifiReconnectFailure[]
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.info(`尝试连接 ${ssid} (第 ${attempt}/${maxRetries} 次)`);

      // 广播连接进度到UI
      this.broadcastReconnectProgress({
        ssid,
        attempt,
        maxAttempts: maxRetries,
        status: 'connecting',
      });

      try {
        // 等待2秒后尝试连接
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const success = await this.wifiSwitcherService!.connectToConfiguredNetwork(ssid);

        if (success) {
          this.logger.success(`连接成功: ${ssid} (第 ${attempt}/${maxRetries} 次)`);

          // 广播成功状态
          this.broadcastReconnectProgress({
            ssid,
            attempt,
            maxAttempts: maxRetries,
            status: 'success',
          });

          return true;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`连接失败: ${ssid} (第 ${attempt}/${maxRetries} 次) - ${errorMessage}`);

        // 如果是最后一次尝试，广播失败状态并记录到失败列表
        if (attempt === maxRetries) {
          this.broadcastReconnectProgress({
            ssid,
            attempt,
            maxAttempts: maxRetries,
            status: 'failed',
          });

          failedList.push({
            ssid,
            priority,
            reason: errorMessage || '连接超时',
          });
        }
      }
    }

    return false;
  }

  /**
   * 成功重连后的后续处理
   */
  private async finalizeSuccessfulReconnect(): Promise<void> {
    // 等待WiFi连接稳定
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 更新网络状态
    await this.notifyNetworkStatusChange();
  }

  /**
   * 广播WiFi重连进度到UI
   */
  private broadcastReconnectProgress(progress: WifiReconnectProgress): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    this.window.webContents.send('event:wifi:reconnectProgress', progress);
  }

  /**
   * 广播所有WiFi连接失败事件到UI
   */
  private broadcastAllWifiFailed(failedList: WifiReconnectFailure[]): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const event: WifiAllReconnectsFailed = { failedList };
    this.window.webContents.send('event:wifi:allReconnectsFailed', event);
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
        const ssid = match[1].trim();
        this.logger.debug(`[WiFi检测] 获取到SSID: ${ssid}`);
        return ssid;
      }

      // 如果没有匹配到，说明未连接WiFi，记录原始输出
      this.logger.debug(`[WiFi检测] 未连接WiFi，networksetup输出: ${stdout.trim()}`);
      return null;
    } catch (error) {
      // networksetup失败，记录错误
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.debug(`[WiFi检测] networksetup命令失败: ${errorMsg}`);
      return null;
    }
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

      // 如果WiFi已断开（SSID为null），立即发送断开状态，无需等待网络检测
      if (this.lastSsid === null) {
        this.logger.info('WiFi已断开，立即发送断开状态');
        const disconnectedStatus = {
          connected: false,
          authenticated: false,
          wifiConnected: false,
          ssid: null,
        };
        this.window.webContents.send('event:network:statusChanged', disconnectedStatus);
        return;
      }

      // WiFi已连接，获取完整网络状态
      // 立即发送 loading 状态，让 UI 显示加载动画
      this.window.webContents.send('event:network:statusLoading', {
        loading: true,
        wifiConnected: true,
        ssid: this.lastSsid,
      });

      // 等待网络接口完全初始化
      await new Promise((resolve) => setTimeout(resolve, 1000));

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
