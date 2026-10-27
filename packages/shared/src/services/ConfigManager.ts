/** Configuration commits are serialized and published only after durable storage succeeds. */
import { AppConfig, AppSettings } from '../types/config';
import { validateAppConfig, createDefaultAppConfig, normalizeAppConfig } from '../utils/validator';
import { DEFAULT_APP_SETTINGS } from '../constants/defaults';
import { normalizeAppSettings } from '../utils/validator';
import { ErrorCode, AppError } from '../constants/errors';
import { StorageAdapter, MemoryStorageAdapter } from './StorageAdapter';
import type { Logger } from '../models/Logger';

const CONFIG_STORAGE_KEY = 'app_config';
type ConfigPatch = Partial<AppConfig> | ((current: AppConfig) => Partial<AppConfig>);
const copy = (config: AppConfig): AppConfig => JSON.parse(JSON.stringify(config)) as AppConfig;

export class ConfigManager {
  private config: AppConfig | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private loading: Promise<AppConfig> | null = null;
  private listeners = new Set<(config: AppConfig) => void>();

  constructor(
    private storage: StorageAdapter = new MemoryStorageAdapter(),
    private logger?: Logger
  ) {}

  setStorage(storage: StorageAdapter): void {
    this.storage = storage;
  }

  async load(): Promise<AppConfig> {
    if (this.config) return copy(this.config);
    if (!this.loading) {
      this.loading = (async () => {
        try {
          const stored = await this.storage.get<AppConfig>(CONFIG_STORAGE_KEY);
          let config = stored ? normalizeAppConfig(stored) : createDefaultAppConfig();
          if (!validateAppConfig(config).valid) config = createDefaultAppConfig();
          config = normalizeAppConfig(config);
          if (!stored || JSON.stringify(stored) !== JSON.stringify(config)) {
            await this.storage.set(CONFIG_STORAGE_KEY, copy(config));
          }
          this.config = config;
          return copy(config);
        } catch (error) {
          throw new AppError(
            ErrorCode.CONFIG_LOAD_FAILED,
            error instanceof Error ? error.message : '加载配置失败'
          );
        } finally {
          this.loading = null;
        }
      })();
    }
    return this.loading;
  }

  subscribe(listener: (config: AppConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getConfig(): AppConfig | null {
    return this.config ? copy(this.config) : null;
  }
  getSettings(): AppSettings {
    return this.getConfig()?.settings ?? normalizeAppSettings(DEFAULT_APP_SETTINGS);
  }

  private commit(build: (current: AppConfig) => AppConfig): Promise<AppConfig> {
    const operation = this.queue.then(async () => {
      if (!this.config) await this.load();
      const current = copy(this.config!);
      const next = normalizeAppConfig(build(current));
      const validation = validateAppConfig(next);
      if (!validation.valid)
        throw new AppError(ErrorCode.CONFIG_INVALID, validation.errors.join('; '));
      next.revision = Math.max(current.revision ?? 0, next.revision ?? 0) + 1;
      try {
        await this.storage.set(CONFIG_STORAGE_KEY, copy(next));
      } catch (error) {
        throw new AppError(
          ErrorCode.CONFIG_SAVE_FAILED,
          error instanceof Error ? error.message : '保存配置失败'
        );
      }
      this.config = next;
      this.logger?.debug('配置已提交', { revision: next.revision });
      for (const listener of this.listeners) {
        try {
          listener(copy(next));
        } catch {
          /* A subscriber cannot undo a durable commit. */
        }
      }
      return copy(next);
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }

  async save(config?: AppConfig): Promise<void> {
    await this.commit((current) => {
      if (config?.revision !== undefined && config.revision < (current.revision ?? 0))
        throw new AppError(ErrorCode.CONFIG_INVALID, '配置已更新，请刷新后重试');
      return config ? copy(config) : current;
    });
  }

  update(patch: ConfigPatch): Promise<AppConfig> {
    return this.commit((current) => {
      const partial = typeof patch === 'function' ? patch(copy(current)) : patch;
      if (partial.revision !== undefined && partial.revision < (current.revision ?? 0))
        throw new AppError(ErrorCode.CONFIG_INVALID, '配置已更新，请刷新后重试');
      return { ...current, ...partial, settings: { ...current.settings, ...partial.settings } };
    });
  }

  async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    return (await this.update((current) => ({ settings: { ...current.settings, ...settings } })))
      .settings;
  }

  reset(): Promise<AppConfig> {
    return this.commit(() => createDefaultAppConfig());
  }
  validate(config: Partial<AppConfig>): { valid: boolean; errors: string[] } {
    return validateAppConfig(config);
  }
}

export function createConfigManager(storage?: StorageAdapter, logger?: Logger): ConfigManager {
  return new ConfigManager(storage, logger);
}
