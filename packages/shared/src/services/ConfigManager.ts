/**
 * 配置管理服务
 */

import { AppConfig, AppSettings } from '../types/config';
import { validateAppConfig, createDefaultAppConfig } from '../utils/validator';
import { DEFAULT_APP_SETTINGS } from '../constants/defaults';
import { ErrorCode, AppError } from '../constants/errors';
import { StorageAdapter, MemoryStorageAdapter } from './StorageAdapter';

/**
 * 配置存储键
 */
const CONFIG_STORAGE_KEY = 'app_config';

/**
 * 配置管理服务类
 */
export class ConfigManager {
  private storage: StorageAdapter;
  private config: AppConfig | null = null;

  constructor(storage?: StorageAdapter) {
    this.storage = storage || new MemoryStorageAdapter();
  }

  /**
   * 设置存储适配器
   */
  setStorage(storage: StorageAdapter): void {
    this.storage = storage;
  }

  /**
   * 加载配置
   */
  async load(): Promise<AppConfig> {
    try {
      const stored = await this.storage.get<AppConfig>(CONFIG_STORAGE_KEY);

      if (stored) {
        // 验证存储的配置
        const validation = validateAppConfig(stored);
        if (validation.valid) {
          // 合并默认设置以确保新增字段有默认值
          this.config = {
            ...createDefaultAppConfig(),
            ...stored,
            settings: {
              ...DEFAULT_APP_SETTINGS,
              ...stored.settings,
            },
          };
          return this.config;
        }
      }

      // 如果没有配置或配置无效，创建默认配置
      this.config = createDefaultAppConfig();
      await this.save();
      return this.config;
    } catch (error) {
      throw new AppError(
        ErrorCode.CONFIG_LOAD_FAILED,
        error instanceof Error ? error.message : '加载配置失败'
      );
    }
  }

  /**
   * 保存配置
   */
  async save(config?: AppConfig): Promise<void> {
    try {
      if (config) {
        const validation = validateAppConfig(config);
        if (!validation.valid) {
          throw new AppError(ErrorCode.CONFIG_INVALID, validation.errors.join('; '));
        }
        this.config = config;
      }

      if (!this.config) {
        throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '没有可保存的配置');
      }

      await this.storage.set(CONFIG_STORAGE_KEY, this.config);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        ErrorCode.CONFIG_SAVE_FAILED,
        error instanceof Error ? error.message : '保存配置失败'
      );
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): AppConfig | null {
    return this.config;
  }

  /**
   * 更新配置
   */
  async update(partial: Partial<AppConfig>): Promise<AppConfig> {
    if (!this.config) {
      await this.load();
    }

    this.config = {
      ...this.config!,
      ...partial,
    };

    await this.save();
    return this.config;
  }

  /**
   * 更新设置
   */
  async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    if (!this.config) {
      await this.load();
    }

    this.config!.settings = {
      ...this.config!.settings,
      ...settings,
    };

    await this.save();
    return this.config!.settings;
  }

  /**
   * 获取设置
   */
  getSettings(): AppSettings {
    return this.config?.settings || DEFAULT_APP_SETTINGS;
  }

  /**
   * 重置配置
   */
  async reset(): Promise<AppConfig> {
    this.config = createDefaultAppConfig();
    await this.save();
    return this.config;
  }

  /**
   * 验证配置
   */
  validate(config: Partial<AppConfig>): { valid: boolean; errors: string[] } {
    return validateAppConfig(config);
  }
}

/**
 * 创建配置管理服务实例
 */
export function createConfigManager(storage?: StorageAdapter): ConfigManager {
  return new ConfigManager(storage);
}
