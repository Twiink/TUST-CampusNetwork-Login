/**
 * IPC 入口参数校验
 *
 * 渲染进程传入的参数是不可信输入，在进入服务层之前统一校验。
 * - 新增（add）：id 由服务层生成，校验前以占位 id 补齐，
 *   username/password 等必填字段按原样校验；
 * - 更新（update）：入参是 Partial，只校验显式出现的字段，
 *   未提供的必填字段以占位补齐，避免把合法的部分更新误判为缺字段。
 */

import {
  validateAccountConfig,
  validateAppConfig,
  validateWifiConfig,
  type AccountConfig,
  type ValidationResult,
  type WifiConfig,
} from '@repo/shared';

export function assertValid(result: ValidationResult, context: string): void {
  if (!result.valid) {
    throw new Error(`参数校验失败(${context}): ${result.errors.join('; ')}`);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 校验账户输入。partial=true 为更新场景（允许缺失必填字段，只校验出现的字段）。 */
export function assertAccountInput(account: unknown, context: string, partial = false): void {
  if (!isRecord(account)) {
    throw new Error(`参数校验失败(${context}): 账户必须是对象`);
  }
  const placeholder = '__pending__';
  const candidate = (
    partial
      ? { id: placeholder, username: placeholder, password: placeholder, ...account }
      : { id: placeholder, ...account }
  ) as Partial<AccountConfig>;
  assertValid(validateAccountConfig(candidate), context);
}

/** 校验 WiFi 配置输入。partial=true 为更新场景。 */
export function assertWifiInput(wifi: unknown, context: string, partial = false): void {
  if (!isRecord(wifi)) {
    throw new Error(`参数校验失败(${context}): WiFi 配置必须是对象`);
  }
  const placeholder = '__pending__';
  const candidate = (
    partial
      ? { id: placeholder, ssid: placeholder, linkedAccountIds: [], priority: 10, ...wifi }
      : { id: placeholder, ...wifi }
  ) as Partial<WifiConfig>;
  assertValid(validateWifiConfig(candidate), context);
}

/** 校验整份应用配置 */
export function assertAppConfigInput(config: unknown, context: string): void {
  if (!isRecord(config)) {
    throw new Error(`参数校验失败(${context}): 配置必须是对象`);
  }
  assertValid(validateAppConfig(config as never), context);
}
