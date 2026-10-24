/**
 * Windows 命令输出解码工具
 * 中文 Windows 的 netsh/ipconfig 等命令输出为 GBK（CP936）编码，
 * child_process 默认按 utf8 解码会导致 SSID 值、「信号」等中文字段乱码。
 * 统一以 Buffer 接收输出后用 Node 内置 TextDecoder 按 GBK 解码
 * （Node 14+/Electron 自带全量 ICU，无需第三方依赖）；
 * GBK 与 ASCII 兼容，英文系统输出不受影响。
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execBufferAsync = promisify(exec);

/** 简体中文 Windows 控制台默认代码页（GBK/CP936） */
const windowsConsoleDecoder = new TextDecoder('gbk');

/**
 * 将 Windows 命令的 Buffer 输出按 GBK 解码为文本
 */
export function decodeWindowsText(output: Buffer): string {
  return windowsConsoleDecoder.decode(output);
}

/**
 * 执行 Windows 命令并返回按 GBK 正确解码的文本输出
 * 仅应在 win32 平台调用
 */
export async function execWindowsText(command: string, timeout = 10000): Promise<string> {
  const { stdout } = await execBufferAsync(command, {
    timeout,
    encoding: 'buffer',
    windowsHide: true,
  });
  return decodeWindowsText(stdout as Buffer);
}
