/**
 * 存储适配器接口
 */

/**
 * 存储适配器接口 - 各平台需要实现此接口
 */
export interface StorageAdapter {
  /**
   * 获取值
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * 设置值
   */
  set<T>(key: string, value: T): Promise<void>;

  /**
   * 删除值
   */
  remove(key: string): Promise<void>;

  /**
   * 清除所有值
   */
  clear(): Promise<void>;

  /**
   * 获取所有键
   */
  keys(): Promise<string[]>;
}

/**
 * 内存存储适配器 (用于测试或临时存储)
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private store: Map<string, unknown> = new Map();

  async get<T>(key: string): Promise<T | null> {
    const value = this.store.get(key);
    return value !== undefined ? (value as T) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}
