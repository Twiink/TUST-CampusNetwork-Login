/**
 * 本地存储服务 - Electron 平台实现
 */

import { app, safeStorage } from 'electron';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { StorageAdapter } from '@repo/shared';
import { devLog } from '../utils/dev-log';

/**
 * 存储文件路径
 */
const getStoragePath = () => {
  return path.join(app.getPath('userData'), 'config.json');
};

/**
 * 加密字段标记
 */
const ENCRYPTED_PREFIX = '__encrypted__:';

/**
 * 敏感字段列表
 */
const SENSITIVE_FIELDS = ['password', 'userPassword'];

/**
 * Electron 存储适配器
 */
const SAVE_DEBOUNCE_MS = 500;

export class ElectronStorageAdapter implements StorageAdapter {
  private data: Record<string, unknown> = {};
  private loaded = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private savePromise: Promise<void> | null = null;
  private saveAgain = false;

  /**
   * 加载存储文件
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    try {
      const filePath = getStoragePath();
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        this.data = JSON.parse(content);
        // 解密敏感数据
        this.decryptSensitiveData(this.data);
      }
    } catch (error) {
      devLog.error('Failed to load storage:', error);
      this.data = {};
    }

    this.loaded = true;
  }

  /**
   * 保存存储文件
   */
  private async saveToFile(): Promise<void> {
    const filePath = getStoragePath();
    const tempPath = `${filePath}.tmp`;
    // 加密时只复制命中的对象路径；非敏感子树保持原引用，不深拷贝整个配置。
    const dataToSave = this.encryptSensitiveData({ ...this.data });
    const content = JSON.stringify(dataToSave, null, 2);
    try {
      await fsp.writeFile(tempPath, content, 'utf-8');
      await fsp.rename(tempPath, filePath);
    } catch (error) {
      devLog.error('Failed to save storage:', error);
      throw error;
    }
  }

  private scheduleSave(): Promise<void> {
    this.saveAgain = true;
    if (this.saveTimer || this.savePromise) {
      return this.savePromise ?? Promise.resolve();
    }

    const run = async () => {
      // 窗口内后续写入共用一次落盘；窗口内再次写入会在循环中补写。
      await new Promise<void>((resolve) => setTimeout(resolve, SAVE_DEBOUNCE_MS));
      do {
        this.saveAgain = false;
        await this.saveToFile();
      } while (this.saveAgain);
    };

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.savePromise = run()
        .catch((error) => {
          devLog.error('Debounced storage save failed:', error);
        })
        .finally(() => {
          this.savePromise = null;
          this.saveAgain = false;
        });
    }, 0);
    return this.savePromise ?? Promise.resolve();
  }

  /** 退出路径使用：立即写出尚未落盘的数据 */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.savePromise) {
      await this.savePromise.catch(() => undefined);
    } else if (this.saveAgain) {
      this.saveAgain = false;
      await this.saveToFile();
    }
  }

  /**
   * 加密敏感数据
   */
  private encryptSensitiveData(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.encryptSensitiveData(item));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (
        SENSITIVE_FIELDS.includes(key) &&
        typeof value === 'string' &&
        safeStorage.isEncryptionAvailable()
      ) {
        // 加密敏感字段
        const encrypted = safeStorage.encryptString(value);
        result[key] = ENCRYPTED_PREFIX + encrypted.toString('base64');
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.encryptSensitiveData(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * 解密敏感数据
   */
  private decryptSensitiveData(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach((item) => this.decryptSensitiveData(item));
      return;
    }

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (
        typeof value === 'string' &&
        value.startsWith(ENCRYPTED_PREFIX) &&
        safeStorage.isEncryptionAvailable()
      ) {
        // 解密敏感字段
        try {
          const encrypted = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');
          (obj as Record<string, unknown>)[key] = safeStorage.decryptString(encrypted);
        } catch {
          // 解密失败，保持原值
        }
      } else if (typeof value === 'object' && value !== null) {
        this.decryptSensitiveData(value);
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    await this.ensureLoaded();
    const value = this.data[key];
    return value !== undefined ? (value as T) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.ensureLoaded();
    this.data[key] = value;
    return this.scheduleSave();
  }

  async remove(key: string): Promise<void> {
    await this.ensureLoaded();
    delete this.data[key];
    return this.scheduleSave();
  }

  async clear(): Promise<void> {
    this.data = {};
    return this.scheduleSave();
  }

  async keys(): Promise<string[]> {
    await this.ensureLoaded();
    return Object.keys(this.data);
  }
}

/**
 * 创建 Electron 存储适配器
 */
export function createElectronStorage(): ElectronStorageAdapter {
  return new ElectronStorageAdapter();
}
