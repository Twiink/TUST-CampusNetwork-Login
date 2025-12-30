/**
 * 自动更新服务
 */

import { autoUpdater, UpdateInfo } from 'electron-updater';
import { BrowserWindow } from 'electron';
import { createLogger } from '@repo/shared';

export interface UpdateCallbacks {
  /** 检查更新时 */
  onCheckingForUpdate?: () => void;
  /** 有更新可用 */
  onUpdateAvailable?: (info: UpdateInfo) => void;
  /** 没有更新 */
  onUpdateNotAvailable?: (info: UpdateInfo) => void;
  /** 下载进度 */
  onDownloadProgress?: (progress: { percent: number; bytesPerSecond: number }) => void;
  /** 更新下载完成 */
  onUpdateDownloaded?: (info: UpdateInfo) => void;
  /** 更新错误 */
  onError?: (error: Error) => void;
}

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  progress: number;
  version: string | null;
  error: string | null;
}

/**
 * 自动更新服务类
 */
export class UpdaterService {
  private logger: ReturnType<typeof createLogger>;
  private callbacks: UpdateCallbacks;
  private status: UpdateStatus = {
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    progress: 0,
    version: null,
    error: null,
  };

  constructor(logger: ReturnType<typeof createLogger>, callbacks: UpdateCallbacks = {}) {
    this.logger = logger;
    this.callbacks = callbacks;
    this.setupAutoUpdater();
  }

  /**
   * 配置自动更新器
   */
  private setupAutoUpdater(): void {
    // 不自动下载
    autoUpdater.autoDownload = false;
    // 不自动安装退出时
    autoUpdater.autoInstallOnAppQuit = true;

    // 检查更新中
    autoUpdater.on('checking-for-update', () => {
      this.status.checking = true;
      this.status.error = null;
      this.logger.info('正在检查更新...');
      this.callbacks.onCheckingForUpdate?.();
      this.broadcastStatus();
    });

    // 有更新可用
    autoUpdater.on('update-available', (info) => {
      this.status.checking = false;
      this.status.available = true;
      this.status.version = info.version;
      this.logger.info(`发现新版本: ${info.version}`);
      this.callbacks.onUpdateAvailable?.(info);
      this.broadcastStatus();
    });

    // 没有更新
    autoUpdater.on('update-not-available', (info) => {
      this.status.checking = false;
      this.status.available = false;
      this.logger.info('当前已是最新版本');
      this.callbacks.onUpdateNotAvailable?.(info);
      this.broadcastStatus();
    });

    // 下载进度
    autoUpdater.on('download-progress', (progress) => {
      this.status.downloading = true;
      this.status.progress = progress.percent;
      this.logger.debug(`下载进度: ${progress.percent.toFixed(1)}%`);
      this.callbacks.onDownloadProgress?.({
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
      });
      this.broadcastStatus();
    });

    // 更新下载完成
    autoUpdater.on('update-downloaded', (info) => {
      this.status.downloading = false;
      this.status.downloaded = true;
      this.status.progress = 100;
      this.logger.info(`更新下载完成: ${info.version}`);
      this.callbacks.onUpdateDownloaded?.(info);
      this.broadcastStatus();
    });

    // 更新错误
    autoUpdater.on('error', (error) => {
      this.status.checking = false;
      this.status.downloading = false;
      this.status.error = error.message;
      this.logger.error('更新错误', error);
      this.callbacks.onError?.(error);
      this.broadcastStatus();
    });
  }

  /**
   * 广播状态到所有窗口
   */
  private broadcastStatus(): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('event:update:statusChanged', this.status);
    });
  }

  /**
   * 检查更新
   */
  async checkForUpdates(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.logger.error('检查更新失败', error);
      throw error;
    }
  }

  /**
   * 下载更新
   */
  async downloadUpdate(): Promise<void> {
    if (!this.status.available) {
      throw new Error('没有可用的更新');
    }

    try {
      this.status.downloading = true;
      this.broadcastStatus();
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.status.downloading = false;
      this.logger.error('下载更新失败', error);
      throw error;
    }
  }

  /**
   * 安装更新并重启
   */
  quitAndInstall(): void {
    if (!this.status.downloaded) {
      throw new Error('更新尚未下载完成');
    }
    autoUpdater.quitAndInstall();
  }

  /**
   * 获取当前状态
   */
  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  /**
   * 设置回调
   */
  setCallbacks(callbacks: UpdateCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
}

/**
 * 创建更新服务实例
 */
export function createUpdaterService(
  logger: ReturnType<typeof createLogger>,
  callbacks?: UpdateCallbacks
): UpdaterService {
  return new UpdaterService(logger, callbacks);
}
