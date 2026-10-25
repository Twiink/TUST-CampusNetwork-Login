/**
 * 安全存储装饰器
 *
 * 将配置中的敏感字段（校园网账户密码、WiFi 密码）抽入 react-native-keychain
 * （Android 经 Keystore/Tink 加密），JSON 中仅保留 `__keychain__:` 占位引用。
 *
 * 与桌面端 safeStorage 装饰器（apps/desktop/electron/services/store.ts）策略对齐：
 * - 旧明文数据首次读取时原样返回，下次保存自动迁移进 keychain（惰性迁移）；
 * - keychain 条目丢失时回退为空字符串，避免把占位符当密码发出去。
 */

import * as Keychain from 'react-native-keychain';
import type { StorageAdapter } from '@repo/shared';

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

const serviceName = (path: string): string => `${SERVICE_PREFIX}:${path}`;

/**
 * 深拷贝 value 并把敏感字段字符串抽出为待写入 keychain 的条目，原位替换为占位符。
 * 引用按 JSON 路径生成，随占位符内联保存，每次 set 重新生成，无跨版本稳定性要求。
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
      const service = serviceName(childPath);
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

/** 把占位符替换回 keychain 中的真实密码；条目缺失时回退为空字符串 */
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
      try {
        const credentials = await Keychain.getGenericPassword({ service });
        result[key] = credentials && credentials.password ? credentials.password : '';
      } catch {
        result[key] = '';
      }
    } else if (isPlainObject(value) || Array.isArray(value)) {
      result[key] = await rehydrateSecrets(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** 读取引用索引，删除本次保存后不再被引用的 keychain 条目，防止账户删除后遗留密码 */
async function cleanupOrphanedServices(activeServices: string[]): Promise<void> {
  const active = new Set(activeServices);
  let previous: string[] = [];
  try {
    const index = await Keychain.getGenericPassword({ service: INDEX_SERVICE });
    if (index && index.password) {
      previous = JSON.parse(index.password) as string[];
    }
  } catch {
    // 索引不可读时跳过清理，保守起见不删除任何条目
    return;
  }

  await Promise.all(
    previous
      .filter(service => !active.has(service))
      .map(service => Keychain.resetGenericPassword({ service }).catch(() => undefined))
  );

  await Keychain.setGenericPassword('index', JSON.stringify(activeServices), {
    service: INDEX_SERVICE,
  });
}

async function resetServices(services: string[]): Promise<void> {
  await Promise.all(
    services.map(service => Keychain.resetGenericPassword({ service }).catch(() => undefined))
  );
}

/**
 * 用 keychain 保护装饰内层存储适配器的敏感字段。
 */
export function createSecureStorage(inner: StorageAdapter): StorageAdapter {
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await inner.get<unknown>(key);
      if (raw === null || typeof raw !== 'object') {
        return raw as T | null;
      }
      return (await rehydrateSecrets(raw)) as T;
    },

    async set<T>(key: string, value: T): Promise<void> {
      if (value === null || typeof value !== 'object') {
        await inner.set(key, value);
        return;
      }

      const writes: PendingWrite[] = [];
      const stripped = extractSecrets(value, '', writes);
      await Promise.all(
        writes.map(write =>
          Keychain.setGenericPassword(write.username, write.password, {
            service: write.service,
          })
        )
      );
      await cleanupOrphanedServices(writes.map(write => write.service));
      await inner.set(key, stripped);
    },

    async remove(key: string): Promise<void> {
      const raw = await inner.get<unknown>(key);
      if (raw !== null && typeof raw === 'object') {
        await resetServices(collectReferences(raw));
      }
      await inner.remove(key);
    },

    async clear(): Promise<void> {
      const allKeys = await inner.keys();
      const allRefs: string[] = [];
      for (const key of allKeys) {
        const raw = await inner.get<unknown>(key);
        if (raw !== null && typeof raw === 'object') {
          allRefs.push(...collectReferences(raw));
        }
      }
      await resetServices(allRefs);
      await Keychain.resetGenericPassword({ service: INDEX_SERVICE }).catch(() => undefined);
      await inner.clear();
    },

    async keys(): Promise<string[]> {
      return inner.keys();
    },
  };
}
