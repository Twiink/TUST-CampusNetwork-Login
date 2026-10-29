/**
 * 安全存储装饰器
 *
 * 将配置中的敏感字段（校园网账户密码、WiFi 密码）抽入 react-native-keychain
 * （Android 经 Keystore/Tink 加密），JSON 中仅保留 `__keychain__:` 占位引用。
 *
 * 与桌面端 safeStorage 装饰器（apps/desktop/electron/services/store.ts）策略对齐：
 * - 旧明文数据首次读取时原样返回，下次保存自动迁移进 keychain（惰性迁移）；
 * - 无法读取的秘密明确报错，不把读取失败转换成默认配置。
 */

import * as Keychain from 'react-native-keychain';
import { generateId, type StorageAdapter } from '@repo/shared';

/** 与桌面端 store.ts 的 SENSITIVE_FIELDS 保持一致 */
const SENSITIVE_FIELDS = new Set(['password', 'userPassword']);
const KEYCHAIN_PREFIX = '__keychain__:';
const SERVICE_PREFIX = 'netmate:secure';
const INDEX_SERVICE = 'netmate:secure-index';

interface PendingWrite {
  service: string;
  username: string;
  password: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 深拷贝 value 并把敏感字段字符串抽出为待写入 keychain 的条目，原位替换为占位符。
 * 每次提交使用独立命名空间，失败时不会覆盖旧配置仍在引用的秘密。
 */
function extractSecrets(node: unknown, path: string, writes: PendingWrite[]): unknown {
  if (Array.isArray(node)) {
    return node.map((item, index) => extractSecrets(item, `${path}.${index}`, writes));
  }

  if (!isPlainObject(node)) {
    return node;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    const childPath = path ? `${path}.${key}` : key;
    if (SENSITIVE_FIELDS.has(key) && typeof value === 'string' && value.length > 0) {
      const service = `${SERVICE_PREFIX}:${childPath}`;
      writes.push({ service, username: key, password: value });
      result[key] = `${KEYCHAIN_PREFIX}${service}`;
    } else if (isPlainObject(value) || Array.isArray(value)) {
      result[key] = extractSecrets(value, childPath, writes);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** 收集结构中已存在的全部 keychain 引用（用于 remove/clear 时的条目清理） */
function collectReferences(node: unknown, refs: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach(item => collectReferences(item, refs));
  } else if (isPlainObject(node)) {
    for (const [, value] of Object.entries(node)) {
      if (typeof value === 'string' && value.startsWith(KEYCHAIN_PREFIX)) {
        refs.push(value.slice(KEYCHAIN_PREFIX.length));
      } else {
        collectReferences(value, refs);
      }
    }
  }
  return refs;
}

/** 把旧、新格式占位符都作为不透明引用读取。 */
async function rehydrateSecrets(node: unknown): Promise<unknown> {
  if (Array.isArray(node)) {
    return Promise.all(node.map(item => rehydrateSecrets(item)));
  }

  if (!isPlainObject(node)) {
    return node;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string' && value.startsWith(KEYCHAIN_PREFIX)) {
      const service = value.slice(KEYCHAIN_PREFIX.length);
      const credentials = await Keychain.getGenericPassword({ service });
      if (!credentials || !credentials.password)
        throw new Error('密码条目不存在，请恢复钥匙串后重试');
      result[key] = credentials.password;
    } else if (isPlainObject(value) || Array.isArray(value)) {
      result[key] = await rehydrateSecrets(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function readIndex(): Promise<string[]> {
  const index = await Keychain.getGenericPassword({ service: INDEX_SERVICE });
  return index ? JSON.parse(index.password) : [];
}

async function writeIndex(services: string[]): Promise<void> {
  const result = await Keychain.setGenericPassword('index', JSON.stringify(services), {
    service: INDEX_SERVICE,
  });
  if (!result) throw new Error('无法保存密码引用索引');
}

/** 提交之后的清理不撤销配置；未删掉的引用保留到下一次保存。 */
async function cleanupServices(known: string[], activeServices: string[]): Promise<void> {
  const active = new Set(activeServices);
  const pending: string[] = [];
  for (const service of known) {
    if (active.has(service)) continue;
    try {
      await Keychain.resetGenericPassword({ service });
    } catch {
      pending.push(service);
    }
  }
  try {
    const remaining = [...new Set([...activeServices, ...pending])];
    if (remaining.length) await writeIndex(remaining);
    else await Keychain.resetGenericPassword({ service: INDEX_SERVICE });
  } catch {
    // 提交前的索引仍包含全部已知引用，可在下次写入时继续清理。
  }
}

/**
 * 用 keychain 保护装饰内层存储适配器的敏感字段。
 */
export function createSecureStorage(inner: StorageAdapter): StorageAdapter {
  let queue: Promise<unknown> = Promise.resolve();
  const commit = (operation: () => Promise<void>): Promise<void> => {
    const pending = queue.then(operation);
    queue = pending.catch(() => undefined);
    return pending;
  };
  const prepare = async (changingKey?: string) => {
    const entries = await Promise.all(
      (await inner.keys()).map(async key => ({
        key,
        refs: collectReferences(await inner.get(key)),
      }))
    );
    const active = [...new Set(entries.flatMap(entry => entry.refs))];
    const remaining = entries
      .filter(entry => entry.key !== changingKey)
      .flatMap(entry => entry.refs);
    return { known: [...new Set([...(await readIndex()), ...active])], active, remaining };
  };

  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await inner.get<unknown>(key);
      if (raw === null || typeof raw !== 'object') {
        return raw as T | null;
      }
      return (await rehydrateSecrets(raw)) as T;
    },

    set<T>(key: string, value: T): Promise<void> {
      return commit(async () => {
        const { known, remaining } = await prepare(key);
        const writes: PendingWrite[] = [];
        const stripped = extractSecrets(value, `${key}:${generateId()}`, writes);
        const indexed = [...new Set([...known, ...writes.map(write => write.service)])];
        // 先登记新批次，失败或进程中断留下的条目也可被后续保存清理。
        if (indexed.length) await writeIndex(indexed);
        try {
          const results = await Promise.allSettled(
            writes.map(async write => {
              const result = await Keychain.setGenericPassword(write.username, write.password, {
                service: write.service,
              });
              if (!result) throw new Error('密码未能保存');
            })
          );
          const failed = results.find(result => result.status === 'rejected');
          if (failed?.status === 'rejected') throw failed.reason;
          await inner.set(key, stripped);
        } catch (error) {
          await cleanupServices(indexed, known);
          throw error;
        }
        await cleanupServices(indexed, [...remaining, ...writes.map(write => write.service)]);
      });
    },

    remove(key: string): Promise<void> {
      return commit(async () => {
        const { known, remaining } = await prepare(key);
        if (known.length) await writeIndex(known);
        await inner.remove(key);
        await cleanupServices(known, remaining);
      });
    },

    clear(): Promise<void> {
      return commit(async () => {
        const { known } = await prepare();
        if (known.length) await writeIndex(known);
        await inner.clear();
        await cleanupServices(known, []);
      });
    },

    async keys(): Promise<string[]> {
      return inner.keys();
    },
  };
}
