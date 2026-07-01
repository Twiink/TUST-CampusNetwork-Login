/**
 * 文件日志服务
 *
 * 作为 Logger 的监听器，将每条日志以追加方式写入 userData/logs 目录，
 * 全级别、详细保留，按文件大小滚动。打包后应用无终端，文件日志是排查问题的主要依据，
 * 同时供「导出诊断日志」功能读取的内存日志之外提供落盘冗余（崩溃/退出后仍在）。
 *
 * 采用 append 追加而非全量重写，避免每条日志 O(n) 重写内存数组的开销。
 */

import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LogEntry, Logger } from '@repo/shared';

/** 单个日志文件大小上限（字节），超过则滚动。默认 5MB */
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;
/** 滚动保留的历史文件数量（不含当前文件） */
const DEFAULT_MAX_ROLLED_FILES = 3;

export interface FileLoggerOptions {
  maxFileSize?: number;
  maxRolledFiles?: number;
}

export class FileLogger {
  private logDir: string;
  private logFile: string;
  private maxFileSize: number;
  private maxRolledFiles: number;
  private stream: fs.WriteStream | null = null;
  private currentSize = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(options: FileLoggerOptions = {}) {
    this.logDir = path.join(app.getPath('userData'), 'logs');
    this.logFile = path.join(this.logDir, 'netmate.log');
    this.maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    this.maxRolledFiles = options.maxRolledFiles ?? DEFAULT_MAX_ROLLED_FILES;
  }

  /**
   * 附加到 Logger：监听后续日志并写入文件。
   * 返回自身以便链式调用。
   */
  attach(logger: Logger): this {
    this.ensureStream();
    this.unsubscribe = logger.addListener((entry) => {
      this.write(entry);
    });
    return this;
  }

  /**
   * 获取日志目录（供 UI「打开日志目录」等功能使用）
   */
  getLogDir(): string {
    return this.logDir;
  }

  getLogFile(): string {
    return this.logFile;
  }

  private ensureStream(): void {
    if (this.stream) {
      return;
    }
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
      // 记录当前文件大小，用于滚动判断
      try {
        this.currentSize = fs.statSync(this.logFile).size;
      } catch {
        this.currentSize = 0;
      }
      this.stream = fs.createWriteStream(this.logFile, { flags: 'a' });
    } catch {
      // 落盘失败不影响主流程（如权限问题），静默降级为不写文件
      this.stream = null;
    }
  }

  private formatLine(entry: LogEntry): string {
    const timestamp =
      entry.timestamp instanceof Date ? entry.timestamp.toISOString() : String(entry.timestamp);
    const level = entry.level.toUpperCase().padEnd(7);
    const category = (entry.category || 'general').padEnd(8);
    const source = entry.source ? `[${entry.source}] ` : '';
    let data = '';
    if (entry.data !== undefined && entry.data !== null) {
      try {
        data = ` | ${JSON.stringify(entry.data)}`;
      } catch {
        data = ' | [无法序列化的数据]';
      }
    }
    return `[${timestamp}] [${level}] [${category}] ${source}${entry.message}${data}\n`;
  }

  private write(entry: LogEntry): void {
    if (!this.stream) {
      return;
    }
    const line = this.formatLine(entry);
    const byteLength = Buffer.byteLength(line, 'utf-8');

    if (this.currentSize + byteLength > this.maxFileSize) {
      this.roll();
    }

    try {
      this.stream?.write(line);
      this.currentSize += byteLength;
    } catch {
      // 忽略单条写入失败
    }
  }

  /**
   * 滚动日志：netmate.log → netmate.1.log → netmate.2.log ...，超出保留数的删除。
   */
  private roll(): void {
    try {
      this.stream?.end();
    } catch {
      // ignore
    }
    this.stream = null;

    try {
      // 删除最老的
      const oldest = this.rolledPath(this.maxRolledFiles);
      if (fs.existsSync(oldest)) {
        fs.rmSync(oldest, { force: true });
      }
      // 依次后移
      for (let i = this.maxRolledFiles - 1; i >= 1; i--) {
        const src = this.rolledPath(i);
        const dest = this.rolledPath(i + 1);
        if (fs.existsSync(src)) {
          fs.renameSync(src, dest);
        }
      }
      // 当前文件 → .1
      if (fs.existsSync(this.logFile)) {
        fs.renameSync(this.logFile, this.rolledPath(1));
      }
    } catch {
      // 滚动失败时兜底：直接清空当前文件，避免无限增长
      try {
        fs.rmSync(this.logFile, { force: true });
      } catch {
        // ignore
      }
    }

    this.currentSize = 0;
    this.ensureStream();
  }

  private rolledPath(index: number): string {
    return path.join(this.logDir, `netmate.${index}.log`);
  }

  /**
   * 关闭文件流（应用退出时调用）
   */
  close(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.stream) {
      try {
        this.stream.end();
      } catch {
        // ignore
      }
      this.stream = null;
    }
  }
}

export function createFileLogger(options?: FileLoggerOptions): FileLogger {
  return new FileLogger(options);
}
