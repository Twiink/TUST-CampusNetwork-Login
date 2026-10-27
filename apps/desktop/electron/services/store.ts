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

export class ElectronStorageAdapter implements StorageAdapter {
  private data: Record<string, unknown> = {};
  private loaded = false;
  private writes: Promise<void> = Promise.resolve();

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
  private async saveToFile(data: Record<string, unknown>): Promise<void> {
    const filePath = getStoragePath();
    const tempPath = `${filePath}.tmp`;
    // 加密时只复制命中的对象路径；非敏感子树保持原引用，不深拷贝整个配置。
    const dataToSave = this.encryptSensitiveData(data);
    const content = JSON.stringify(dataToSave, null, 2);
    try {
      await fsp.writeFile(tempPath, content, 'utf-8');
      await fsp.rename(tempPath, filePath);
    } catch (error) {
      devLog.error('Failed to save storage:', error);
      throw error;
    }
  }

  private commit(
    change: (data: Record<string, unknown>) => Record<string, unknown>
  ): Promise<void> {
    const operation = this.writes.then(async () => {
      await this.ensureLoaded();
      const next = change({ ...this.data });
      await this.saveToFile(next);
      this.data = next;
    });
    this.writes = operation.catch(() => undefined);
    return operation;
  }

  async flush(): Promise<void> {
    await this.writes;
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
    return this.commit((data) => ({ ...data, [key]: value }));
  }

  async remove(key: string): Promise<void> {
    return this.commit((data) => {
      delete data[key];
      return data;
    });
  }

  async clear(): Promise<void> {
    return this.commit(() => ({}));
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
