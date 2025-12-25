/**
 * 错误码定义
 */

/**
 * 错误码枚举
 */
export enum ErrorCode {
  // 通用错误 (1xxx)
  UNKNOWN = 1000,
  INVALID_CONFIG = 1001,
  INVALID_PARAMS = 1002,

  // 网络错误 (2xxx)
  NETWORK_ERROR = 2000,
  NETWORK_TIMEOUT = 2001,
  NETWORK_UNREACHABLE = 2002,
  DNS_ERROR = 2003,

  // 认证错误 (3xxx)
  AUTH_ERROR = 3000,
  AUTH_FAILED = 3001,
  AUTH_INVALID_CREDENTIALS = 3002,
  AUTH_ACCOUNT_LOCKED = 3003,
  AUTH_SERVER_ERROR = 3004,
  AUTH_ALREADY_ONLINE = 3005,
  AUTH_NO_ACCOUNT = 3006,

  // 配置错误 (4xxx)
  CONFIG_ERROR = 4000,
  CONFIG_NOT_FOUND = 4001,
  CONFIG_INVALID = 4002,
  CONFIG_SAVE_FAILED = 4003,
  CONFIG_LOAD_FAILED = 4004,

  // 平台错误 (5xxx)
  PLATFORM_ERROR = 5000,
  PLATFORM_NOT_SUPPORTED = 5001,
  PLATFORM_PERMISSION_DENIED = 5002,
}

/**
 * 错误消息映射
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCode.UNKNOWN]: '未知错误',
  [ErrorCode.INVALID_CONFIG]: '配置无效',
  [ErrorCode.INVALID_PARAMS]: '参数无效',

  [ErrorCode.NETWORK_ERROR]: '网络错误',
  [ErrorCode.NETWORK_TIMEOUT]: '网络超时',
  [ErrorCode.NETWORK_UNREACHABLE]: '网络不可达',
  [ErrorCode.DNS_ERROR]: 'DNS 解析失败',

  [ErrorCode.AUTH_ERROR]: '认证错误',
  [ErrorCode.AUTH_FAILED]: '认证失败',
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: '用户名或密码错误',
  [ErrorCode.AUTH_ACCOUNT_LOCKED]: '账户已被锁定',
  [ErrorCode.AUTH_SERVER_ERROR]: '认证服务器错误',
  [ErrorCode.AUTH_ALREADY_ONLINE]: '该账户已在线',
  [ErrorCode.AUTH_NO_ACCOUNT]: '未配置账户',

  [ErrorCode.CONFIG_ERROR]: '配置错误',
  [ErrorCode.CONFIG_NOT_FOUND]: '配置不存在',
  [ErrorCode.CONFIG_INVALID]: '配置格式无效',
  [ErrorCode.CONFIG_SAVE_FAILED]: '配置保存失败',
  [ErrorCode.CONFIG_LOAD_FAILED]: '配置加载失败',

  [ErrorCode.PLATFORM_ERROR]: '平台错误',
  [ErrorCode.PLATFORM_NOT_SUPPORTED]: '平台不支持',
  [ErrorCode.PLATFORM_PERMISSION_DENIED]: '权限被拒绝',
};

/**
 * 应用错误类
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
    public details?: unknown
  ) {
    super(message || ErrorMessages[code]);
    this.name = 'AppError';
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * 创建应用错误
 */
export function createError(code: ErrorCode, message?: string, details?: unknown): AppError {
  return new AppError(code, message, details);
}

/**
 * 判断是否是应用错误
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
