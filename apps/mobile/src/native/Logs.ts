import { NativeEventEmitter, NativeModules } from 'react-native';
export interface PersistentLogEntry {
  id: string;
  generation?: string;
  timestamp: number;
  level: 'info' | 'success' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}
export interface PersistentLogPage {
  entries: PersistentLogEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}
interface LogBridge {
  queryPage(cursor: string | null, limit: number): Promise<PersistentLogPage>;
  append(json: string): Promise<PersistentLogEntry>;
  query(level: string | null, limit: number, offset: number): Promise<PersistentLogEntry[]>;
  clear(): Promise<string | boolean>;
  export(): Promise<boolean>;
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
  cursor: string | null = null
): Promise<PersistentLogPage> {
  return module()?.queryPage(cursor, 500) ?? { entries: [], nextCursor: null, hasMore: false };
}
export async function clearPersistentLogs(): Promise<string | undefined> {
  const generation = await module()?.clear();
  return typeof generation === 'string' ? generation : undefined;
}
export async function exportPersistentLogs(): Promise<void> {
  if (!module()) throw new Error('当前平台不支持文件日志导出');
  await module()!.export();
}
export function onPersistentLog(handler: (entry: PersistentLogEntry) => void) {
  const bridge = module();
  return bridge
    ? new NativeEventEmitter(bridge as never).addListener('netmate:logAdded', handler)
    : null;
}
