import { NativeEventEmitter, NativeModules } from 'react-native';
import type {
  LogHistoryFilter,
  LogHistoryQuery,
  LogPage,
  LogLevel,
  LogCategory,
} from '@repo/shared';
export interface PersistentLogEntry {
  id: string;
  generation?: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  source?: string;
  category?: LogCategory;
  data?: unknown;
}
export type PersistentLogPage = LogPage<PersistentLogEntry>;
interface LogBridge {
  queryPage(cursor: string | null, limit: number): Promise<PersistentLogPage>;
  queryHistory(json: string): Promise<PersistentLogPage>;
  append(json: string): Promise<PersistentLogEntry>;
  query(level: string | null, limit: number, offset: number): Promise<PersistentLogEntry[]>;
  clear(): Promise<string | boolean>;
  exportHistory(format: string, filter: string): Promise<boolean>;
  copy(text: string): Promise<boolean>;
}
const module = (): LogBridge | undefined => NativeModules.LogModule;
export const isLogPersistenceAvailable = () => !!module();
export async function appendPersistentLog(entry: PersistentLogEntry): Promise<void> {
  await module()?.append(JSON.stringify(entry));
}
export async function queryPersistentLogs(
  level: string | null = null,
  limit = 500,
  offset = 0
): Promise<PersistentLogEntry[]> {
  return module()?.query(level, limit, offset) ?? [];
}
export async function queryPersistentLogPage(
  cursor: string | null = null,
  filter: LogHistoryFilter = {}
): Promise<PersistentLogPage> {
  return queryPersistentHistory({ ...filter, cursor, limit: 500 });
}
export async function queryPersistentHistory(
  query: LogHistoryQuery = {}
): Promise<PersistentLogPage> {
  return (
    module()?.queryHistory(JSON.stringify(query)) ?? {
      entries: [],
      nextCursor: null,
      hasMore: false,
      total: 0,
    }
  );
}
export async function clearPersistentLogs(): Promise<string | undefined> {
  const generation = await module()?.clear();
  return typeof generation === 'string' ? generation : undefined;
}
export async function exportPersistentLogs(
  format: 'text' | 'json' = 'text',
  filter: LogHistoryFilter = {}
): Promise<void> {
  if (!module()) throw new Error('当前平台不支持文件日志导出');
  await module()!.exportHistory(format, JSON.stringify(filter));
}
export async function copyLog(text: string): Promise<void> {
  await module()?.copy(text);
}
export function onPersistentLog(handler: (entry: PersistentLogEntry) => void) {
  const bridge = module();
  return bridge
    ? new NativeEventEmitter(bridge as never).addListener('netmate:logAdded', handler)
    : null;
}
