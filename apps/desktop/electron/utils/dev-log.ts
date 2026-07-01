/**
 * 开发态调试输出工具
 *
 * 仅在非打包（开发）环境下输出到终端，用于替换散落在服务里的裸 console.* 调用，
 * 保持开发终端清爽、打包后（无终端）静默。
 *
 * 注意：真正需要长期留痕、供打包后排查的日志应走 Logger（会经 FileLogger 落盘），
 * 本工具仅用于开发期的非致命诊断输出。
 */

import { app } from 'electron';

function isDev(): boolean {
  // app 在极早期或测试环境可能未就绪，做保护性判断
  try {
    return !app.isPackaged;
  } catch {
    return true;
  }
}

export const devLog = {
  warn(...args: unknown[]): void {
    if (isDev()) {
      console.warn(...args);
    }
  },
  error(...args: unknown[]): void {
    if (isDev()) {
      console.error(...args);
    }
  },
  info(...args: unknown[]): void {
    if (isDev()) {
      console.log(...args);
    }
  },
};
