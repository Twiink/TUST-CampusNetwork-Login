/**
 * 配置管理服务
 */

import { AppConfig, AppSettings } from '../types/config';
import { validateAppConfig, createDefaultAppConfig } from '../utils/validator';
import { DEFAULT_APP_SETTINGS } from '../constants/defaults';
import { ErrorCode, AppError } from '../constants/errors';
import { StorageAdapter, MemoryStorageAdapter } from './StorageAdapter';
import type { Logger } from '../models/Logger';

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
  private logger: Logger | null;

  constructor(storage?: StorageAdapter, logger?: Logger) {
    this.storage = storage || new MemoryStorageAdapter();
    this.logger = logger || null;
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
    this.logger?.debug('开始加载应用配置');

    try {
      const stored = await this.storage.get<AppConfig>(CONFIG_STORAGE_KEY);

      if (stored) {
        this.logger?.debug('发现已存储的配置，开始验证');

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

          this.logger?.success('应用配置加载成功', {
            账户数量: this.config.accounts.length,
            WiFi配置数量: this.config.wifiList.length,
            自动重连: this.config.settings.autoReconnect ? '已启用' : '已禁用',
            心跳检测: this.config.settings.enableHeartbeat ? '已启用' : '已禁用',
            轮询间隔: `${this.config.settings.pollingInterval}秒`,
          });

          return this.config;
        } else {
          this.logger?.warn('存储的配置验证失败，将使用默认配置', {
            错误: validation.errors.join('; '),
          });
        }
      } else {
        this.logger?.info('未找到已存储的配置，将创建默认配置');
      }

      // 如果没有配置或配置无效，创建默认配置
      this.config = createDefaultAppConfig();
      await this.save();

      this.logger?.success('默认配置已创建并保存');

      return this.config;
    } catch (error) {
      this.logger?.error('加载配置失败', {
        错误: error instanceof Error ? error.message : String(error),
      });

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
    this.logger?.debug('开始保存应用配置');

    try {
      if (config) {
        this.logger?.debug('验证提供的配置');
        const validation = validateAppConfig(config);
        if (!validation.valid) {
          this.logger?.error('配置验证失败', {
            错误: validation.errors.join('; '),
          });
          throw new AppError(ErrorCode.CONFIG_INVALID, validation.errors.join('; '));
        }
        this.config = config;
        this.logger?.debug('配置验证通过');
      }

      if (!this.config) {
        this.logger?.error('保存配置失败：没有可保存的配置');
        throw new AppError(ErrorCode.CONFIG_NOT_FOUND, '没有可保存的配置');
      }

      await this.storage.set(CONFIG_STORAGE_KEY, this.config);

      this.logger?.success('应用配置保存成功', {
        账户数量: this.config.accounts.length,
        WiFi配置数量: this.config.wifiList.length,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      this.logger?.error('保存配置异常', {
        错误: error instanceof Error ? error.message : String(error),
      });

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
    this.logger?.info('更新应用配置');

    if (!this.config) {
      this.logger?.debug('配置未加载，先加载配置');
      await this.load();
    }

    this.config = {
      ...this.config!,
      ...partial,
    };

    await this.save();

    this.logger?.success('应用配置更新成功');

    return this.config;
  }

  /**
   * 更新设置
   */
  async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    this.logger?.info('更新应用设置', settings);

    if (!this.config) {
      this.logger?.debug('配置未加载，先加载配置');
      await this.load();
    }

    this.config!.settings = {
      ...this.config!.settings,
      ...settings,
    };

    await this.save();

    this.logger?.success('应用设置更新成功', {
      自动重连: this.config!.settings.autoReconnect ? '已启用' : '已禁用',
      心跳检测: this.config!.settings.enableHeartbeat ? '已启用' : '已禁用',
      轮询间隔: `${this.config!.settings.pollingInterval}秒`,
    });

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
    this.logger?.warn('重置应用配置为默认值');

    this.config = createDefaultAppConfig();
    await this.save();

    this.logger?.success('应用配置已重置为默认值');

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
export function createConfigManager(storage?: StorageAdapter, logger?: Logger): ConfigManager {
  return new ConfigManager(storage, logger);
}
