import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  mergeLogs,
  queryLogPage,
  redact,
  redactText,
  type LogEntry,
  type LogHistoryQuery,
  type LogPage,
  type Logger,
} from '@repo/shared';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export interface FileLoggerOptions {
  maxFileSize?: number;
  maxRolledFiles?: number;
}

/** One ordered writer owns append, rotation, snapshots and clear. */
export class FileLogger {
  private logDir = path.join(app.getPath('userData'), 'logs');
  private logFile = path.join(this.logDir, 'netmate.jsonl');
  private stream: fs.WriteStream | null = null;
  private currentSize = 0;
  private logger: Logger | null = null;
  private unsubscribe: (() => void) | null = null;
  private queue: Promise<void> = Promise.resolve();
  private failure: string | undefined;
  private generation = 0;
  private lastPrunedAt = 0;
  private pending = new Map<string, LogEntry>();
  private maxFileSize: number;
  private maxRolledFiles: number;
  constructor(options: FileLoggerOptions = {}) {
    this.maxFileSize = options.maxFileSize ?? 5 * 1024 * 1024;
    this.maxRolledFiles = options.maxRolledFiles ?? 3;
  }
  attach(logger: Logger): this {
    this.logger = logger;
    this.unsubscribe?.();
    this.ensureStream();
    this.unsubscribe = logger.addListener((entry) => {
      this.pending.set(entry.id, entry);
      const generation = this.generation;
      this.queue = this.queue
        .then(async () => {
          if (generation !== this.generation || this.failure) return;
          if (Date.now() - this.lastPrunedAt >= 3_600_000) await this.readAll();
          const line = JSON.stringify(entry) + '\n';
          const bytes = Buffer.byteLength(line);
          if (bytes > this.maxFileSize)
            throw new Error('单条日志超过文件大小上限，当前记录保留在内存中');
          if (this.currentSize + bytes > this.maxFileSize && this.currentSize > 0)
            await this.roll();
          const stream = this.stream;
          if (!stream) return;
          await new Promise<void>((resolve, reject) =>
            stream.write(line, (error) => (error ? reject(error) : resolve()))
          );
          this.currentSize += bytes;
          this.pending.delete(entry.id);
        })
        .catch((error) => this.disableStream(this.stream, error));
    });
    return this;
  }
  getLogDir(): string {
    return this.logDir;
  }
  getLogFile(): string {
    return this.logFile;
  }
  private rolledPath(index: number): string {
    return path.join(this.logDir, `netmate.${index}.jsonl`);
  }
  private ensureStream(): void {
    if (this.stream || this.failure) return;
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
      this.currentSize = fs.existsSync(this.logFile) ? fs.statSync(this.logFile).size : 0;
      const stream = fs.createWriteStream(this.logFile, { flags: 'a' });
      this.stream = stream;
      stream.on('error', (error) => this.disableStream(stream, error));
    } catch (error) {
      this.disableStream(null, error);
    }
  }
  private disableStream(stream: fs.WriteStream | null, error: unknown): void {
    if (stream !== this.stream || this.failure) return;
    this.failure = `文件日志不可用：${error instanceof Error ? error.message : String(error)}`;
    this.stream = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    stream?.destroy();
    this.logger?.warn(this.failure);
  }
  private async endStream(): Promise<void> {
    const stream = this.stream;
    if (!stream) return;
    await new Promise<void>((resolve, reject) => {
      stream.once('error', reject);
      stream.end(() => {
        stream.removeListener('error', reject);
        resolve();
      });
    });
    if (this.stream === stream) this.stream = null;
  }
  private async roll(): Promise<void> {
    await this.endStream();
    const oldest = this.rolledPath(this.maxRolledFiles);
    fs.rmSync(oldest, { force: true });
    for (let index = this.maxRolledFiles - 1; index >= 1; index--) {
      if (fs.existsSync(this.rolledPath(index)))
        fs.renameSync(this.rolledPath(index), this.rolledPath(index + 1));
    }
    if (fs.existsSync(this.logFile)) fs.renameSync(this.logFile, this.rolledPath(1));
    this.ensureStream();
  }
  /** Legacy text is read in place, with its original line preserved in details. */
  private parseLegacy(text: string, file: string): LogEntry[] {
    const records: LogEntry[] = [];
    for (const [index, line] of text.split('\n').entries()) {
      const match = line.match(
        /^\[([^\]]+)\] \[(DEBUG|INFO|SUCCESS|WARN|ERROR)\s*\] \[([^\]]+)\] (?:\[([^\]]+)\] )?(.*)$/
      );
      if (match)
        records.push({
          id: `legacy:${file}:${match[1]}:${index}`,
          timestamp: new Date(match[1]),
          level: match[2].toLowerCase() as LogEntry['level'],
          category: match[3].trim() as LogEntry['category'],
          source: match[4],
          message: redactText(match[5]),
          data: { originalText: redactText(line) },
        });
      else if (line && records.length)
        (records[records.length - 1].data as { originalText: string }).originalText +=
          `\n${redactText(line)}`;
    }
    return records;
  }
  private async readAll(): Promise<{ entries: LogEntry[]; error?: string }> {
    this.lastPrunedAt = Date.now();
    const errors = this.failure ? [this.failure] : [];
    const stored: LogEntry[] = [];
    const cutoff = Date.now() - RETENTION_MS;
    for (const name of fs
      .readdirSync(this.logDir)
      .filter((name) => /^netmate(?:\.\d+)?\.(jsonl|log)$/.test(name))) {
      try {
        const file = path.join(this.logDir, name);
        const text = fs.readFileSync(file, 'utf8');
        let malformed = false;
        const entries = name.endsWith('.log')
          ? this.parseLegacy(text, name)
          : text
              .split('\n')
              .filter(Boolean)
              .flatMap((line, index) => {
                try {
                  const parsed = JSON.parse(line) as LogEntry;
                  return [
                    {
                      ...parsed,
                      timestamp: new Date(parsed.timestamp),
                      message: redactText(parsed.message),
                      data: redact(parsed.data),
                    },
                  ];
                } catch (error) {
                  malformed = true;
                  errors.push(
                    `读取 ${name} 第 ${index + 1} 行失败：${error instanceof Error ? error.message : String(error)}`
                  );
                  return [];
                }
              });
        const retained = entries.filter((entry) => new Date(entry.timestamp).getTime() >= cutoff);
        stored.push(...retained);
        if (!malformed && retained.length < entries.length) {
          if (file === this.logFile) await this.endStream();
          if (!retained.length && file !== this.logFile) fs.rmSync(file);
          else if (name.endsWith('.jsonl'))
            fs.writeFileSync(file, retained.map((entry) => JSON.stringify(entry) + '\n').join(''));
          if (file === this.logFile) this.ensureStream();
        }
      } catch (error) {
        errors.push(`读取 ${name} 失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const entries = mergeLogs(
      stored,
      [...this.pending.values()],
      this.failure ? (this.logger?.getAllLogs() ?? []) : []
    ).filter((entry) => new Date(entry.timestamp).getTime() >= cutoff);
    return { entries, ...(errors.length ? { error: errors.join('\n') } : {}) };
  }
  all(): Promise<{ entries: LogEntry[]; error?: string }> {
    const operation = this.queue.then(() => this.readAll());
    this.queue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }
  async query(options: LogHistoryQuery = {}): Promise<LogPage> {
    const snapshot = await this.all();
    return {
      ...queryLogPage(snapshot.entries, options),
      ...(snapshot.error ? { error: snapshot.error } : {}),
    };
  }
  clear(): Promise<void> {
    this.generation++;
    this.pending.clear();
    const operation = this.queue.then(async () => {
      await this.endStream();
      for (const name of fs
        .readdirSync(this.logDir)
        .filter((name) => /^netmate(?:\.\d+)?\.(jsonl|log)$/.test(name)))
        fs.rmSync(path.join(this.logDir, name));
      this.currentSize = 0;
      this.failure = undefined;
      if (this.logger) this.attach(this.logger);
    });
    this.queue = operation.catch((error) => this.disableStream(this.stream, error));
    return operation;
  }
  close(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    return this.queue
      .then(() => this.endStream())
      .catch((error) => this.disableStream(this.stream, error));
  }
}
export function createFileLogger(options?: FileLoggerOptions): FileLogger {
  return new FileLogger(options);
}
