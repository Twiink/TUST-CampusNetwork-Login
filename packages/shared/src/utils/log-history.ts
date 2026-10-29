import type { LogEntry, LogHistoryFilter, LogHistoryQuery, LogPage, SystemInfo } from '../types';

export const LOG_LEVEL_LABELS = {
  info: '信息',
  success: '成功',
  warn: '警告',
  error: '错误',
  debug: '调试',
} as const;
type HistoryEntry = Omit<LogEntry, 'timestamp'> & { timestamp: Date | number | string };
export const logTime = (entry: HistoryEntry): number => new Date(entry.timestamp).getTime();
export function matchesLog(entry: HistoryEntry, filter: LogHistoryFilter): boolean {
  const time = logTime(entry);
  const keyword = filter.keyword?.trim().toLocaleLowerCase();
  return (
    (!filter.level || filter.level === 'all' || entry.level === filter.level) &&
    (!filter.source ||
      (entry.source ?? '').toLocaleLowerCase().includes(filter.source.toLocaleLowerCase())) &&
    (filter.startTime === undefined || time >= filter.startTime) &&
    (filter.endTime === undefined || time <= filter.endTime) &&
    (!keyword ||
      `${entry.message}\n${entry.source ?? ''}\n${JSON.stringify(entry.data) ?? ''}`
        .toLocaleLowerCase()
        .includes(keyword))
  );
}
export function mergeLogs<T extends HistoryEntry>(...groups: T[][]): T[] {
  const entries = new Map<string, T>();
  groups.forEach((group) => group.forEach((entry) => entries.set(entry.id, entry)));
  return [...entries.values()].sort(
    (a, b) => logTime(b) - logTime(a) || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0)
  );
}
export function queryLogPage<T extends HistoryEntry>(
  entries: T[],
  options: LogHistoryQuery = {}
): LogPage<T> {
  const filtered = entries.filter((entry) => matchesLog(entry, options));
  const cursor = options.cursor
    ? (JSON.parse(options.cursor) as { timestamp: number; id: string })
    : null;
  const before = cursor
    ? filtered.filter(
        (entry) =>
          logTime(entry) < cursor.timestamp ||
          (logTime(entry) === cursor.timestamp && entry.id < cursor.id)
      )
    : filtered;
  const page = before.slice(0, Math.min(500, Math.max(1, options.limit ?? 200)));
  const last = page[page.length - 1];
  return {
    entries: page,
    total: filtered.length,
    hasMore: before.length > page.length,
    nextCursor: last ? JSON.stringify({ timestamp: logTime(last), id: last.id }) : null,
  };
}
export function exportLogHistory(
  entries: LogEntry[],
  format: 'text' | 'json',
  systemInfo?: SystemInfo
): string {
  const times = entries.map(logTime);
  const meta = {
    exportedAt: new Date().toISOString(),
    appName: 'NetMate',
    totalEntries: entries.length,
    timeRange: {
      from: times.length ? new Date(times.reduce((a, b) => Math.min(a, b))).toISOString() : '',
      to: times.length ? new Date(times.reduce((a, b) => Math.max(a, b))).toISOString() : '',
    },
  };
  if (format === 'json') return JSON.stringify({ meta, systemInfo, entries }, null, 2);
  return [
    'NetMate 诊断日志',
    `导出时间: ${meta.exportedAt}`,
    `日志记录 (共 ${entries.length} 条)`,
    systemInfo ? `系统与应用信息:\n${JSON.stringify(systemInfo, null, 2)}` : '',
    ...entries.map(
      (entry) =>
        `[${new Date(entry.timestamp).toISOString()}] [${LOG_LEVEL_LABELS[entry.level]}] [${entry.source ?? entry.category ?? 'app'}] ${entry.message}${entry.data === undefined ? '' : `\n${JSON.stringify(entry.data, null, 2)}`}`
    ),
  ].join('\n');
}
