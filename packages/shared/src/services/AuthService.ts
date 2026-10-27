/**
 * 登录认证服务
 */

import { extractJsonpPayload } from './auth-jsonp';
import { buildUserAccount, buildLoginUrl, buildLogoutUrl } from './auth-protocol';
import type {
  LoginConfig,
  LoginResult,
  LogoutResult,
  MultiAccountLoginAttempt,
  MultiAccountLoginResult,
} from '../types/auth';
import type { ISP, AccountConfig } from '../types/config';
import type { Logger } from '../models/Logger';
import { httpGet, HttpError } from '../utils/httpClient';
import { DEFAULT_SERVER_URL, DEFAULT_CONNECTIVITY_CHECK_URLS } from '../constants/defaults';
import { ErrorCode, AppError } from '../constants/errors';

/**
 * ISP 到账号后缀的映射
 * 注意：根据抓包结果，运营商后缀为 unicom/cmcc/telecom
 */

/**
 * 认证服务类
 */
export class AuthService {
  private operationQueue: Promise<unknown> = Promise.resolve();
  private lastSuccessfulServerUrl: string | null = null;
  runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.operationQueue.then(operation);
    this.operationQueue = pending.catch(() => undefined);
    return pending;
  }

  private serverUrl: string;
  private logger: Logger | null;

  constructor(
    serverUrl: string = DEFAULT_SERVER_URL,
    logger?: Logger,
    private connectivityUrls: readonly string[] = DEFAULT_CONNECTIVITY_CHECK_URLS
  ) {
    this.serverUrl = serverUrl;
    this.logger = logger || null;
  }

  /**
   * 设置服务器地址
   */
  setServerUrl(url: string): void {
    this.serverUrl = url;
    this.logger?.log('info', `认证服务器地址已更新: ${url}`, {
      category: 'auth',
      source: 'AuthService',
    });
  }

  /**
   * 获取服务器地址
   */
  getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * 解析登录响应
   *
   * 判定标准完全对齐生产验证的参考实现（真实抓包）：
   * 响应文本含 `"status":1`（登录成功）或 `已经在线`（账号已在线）即视为成功，
   * 否则判失败。不再依赖 `ret_code`/`result`（此前为抓包推测，已弃用）。
   * 最终是否真正联网由 login() 的二次连通性校验兜底（参考实现同样如此）。
   */
  parseLoginResponse(response: string): LoginResult {
    const indicatesOnline = response.includes('已经在线');
    const indicatesStatus = /"status"\s*:\s*1/.test(response);
    const isSuccess = indicatesStatus || indicatesOnline;

    // 尝试解析 JSONP 提取 msg / ret_code，仅用于日志诊断，不参与成功判定。
    // 提取方式与参考实现一致：取第一个 '(' 到最后一个 ')' 之间，不依赖 callback 名。
    let msg: string | undefined;
    let code: number | undefined;
    const payload = extractJsonpPayload(response);
    if (payload) {
      try {
        const data = JSON.parse(payload);
        msg = typeof data.msg === 'string' ? data.msg : undefined;
        code = typeof data.ret_code === 'number' ? data.ret_code : undefined;
      } catch {
        // 解析失败不影响判定（判定只看原始文本）
      }
    }

    return {
      success: isSuccess,
      message: msg || (isSuccess ? (indicatesOnline ? '账号已在线' : '登录成功') : '登录失败'),
      code,
      rawResponse: response.length > 2048 ? response.slice(0, 2048) : response,
    };
  }

  /**
   * 构建登录 URL(委托 auth-protocol,保留实例方法签名以兼容既有调用方)
   */
  buildLoginUrl(config: LoginConfig): string {
    return buildLoginUrl(config.serverUrl || this.serverUrl, config);
  }

  /**
   * 构建登出 URL(委托 auth-protocol)
   */
  buildLogoutUrl(_wlanUserIp?: string): string {
    return buildLogoutUrl(this.lastSuccessfulServerUrl || this.serverUrl);
  }

  /**
   * 构建用户账号(委托 auth-protocol)
   */
  protected buildUserAccount(username: string, isp: ISP): string {
    return buildUserAccount(username, isp);
  }

  /**
   * 执行登录
   */
  async login(
    config: LoginConfig,
    options: { verifyConnectivity?: boolean } = {}
  ): Promise<LoginResult> {
    const userAccount = buildUserAccount(config.userAccount, config.isp);
    const ispName =
      config.isp === 'campus'
        ? '校园网'
        : config.isp === 'cmcc'
          ? '中国移动'
          : config.isp === 'cucc'
            ? '中国联通'
            : '中国电信';

    this.logger?.log('info', `开始登录认证`, {
      category: 'auth',
      source: 'AuthService',
      data: {
        用户: userAccount,
        运营商: ispName,
        IP: config.wlanUserIp,
        服务器: config.serverUrl || this.serverUrl,
      },
    });

    try {
      const url = buildLoginUrl(config.serverUrl || this.serverUrl, config);
      this.logger?.log('debug', '发送门户登录请求', {
        category: 'request',
        source: 'AuthService',
      });

      const response = await httpGet<string>(url, { timeout: 10000 });
      const result = this.parseLoginResponse(response.rawText);

      if (result.success) {
        this.lastSuccessfulServerUrl = config.serverUrl || this.serverUrl;
        // 二次连通性校验：响应层成功后再确认是否真正联网。
        // 对齐参考实现的保守策略——连通性失败不推翻登录结果，仅在消息/日志标注。
        const reachable = options.verifyConnectivity !== false && (await this.verifyConnectivity());
        if (reachable || options.verifyConnectivity === false) {
          this.logger?.log('success', `登录成功: ${result.message}`, {
            category: 'auth',
            source: 'AuthService',
            data: { 用户: userAccount, 连通性: reachable ? '已确认' : '未校验' },
          });
        } else {
          this.logger?.log('warn', `登录响应成功，但连通性未确认`, {
            category: 'auth',
            source: 'AuthService',
            data: { 用户: userAccount, 连通性: '未确认' },
          });
          result.message = `${result.message}（响应成功，连通性未确认）`;
        }
      } else {
        this.logger?.log('warn', `登录失败: ${result.message}`, {
          category: 'auth',
          source: 'AuthService',
          data: { 用户: userAccount, 错误码: result.code },
        });
      }

      return result;
    } catch (error) {
      this.logger?.log('error', `登录异常`, {
        category: 'auth',
        source: 'AuthService',
        data: {
          用户: userAccount,
          错误: error instanceof Error ? error.message : String(error),
        },
      });

      if (error instanceof HttpError) {
        throw new AppError(ErrorCode.NETWORK_ERROR, error.message, { originalError: error });
      }
      throw new AppError(ErrorCode.AUTH_ERROR, error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 二次连通性校验：仅信任严格的 HTTP 204 响应。
   * 未认证时门户会返回 200 页面，因此不能用 response.ok 判断。
   * 任一探测点返回 204 即视为已联网。全部失败返回 false（不抛异常）。
   */
  private async verifyConnectivity(): Promise<boolean> {
    const results = await Promise.all(
      this.connectivityUrls.map((url) =>
        httpGet(url, { timeout: 3000 })
          .then((response) => response.status === 204)
          .catch(() => false)
      )
    );
    return results.some(Boolean);
  }

  /**
   * 带重试的登录封装
   * 默认 3 次、固定间隔 2 秒，对齐生产验证的参考实现。
   * 被 auto-reconnect 等已有重试层调用时可传 maxRetries=0 关闭内层重试，避免双重叠加。
   * 与 login() 不同：任一次抛出的网络异常会被吸收并重试；仅在耗尽次数后返回最后结果。
   */
  async loginWithRetry(
    config: LoginConfig,
    options: { maxRetries?: number; delayMs?: number } = {}
  ): Promise<LoginResult> {
    const maxRetries = options.maxRetries ?? 2; // 额外重试次数，总尝试 = maxRetries + 1
    const delayMs = options.delayMs ?? 2000;

    let lastResult: LoginResult = {
      success: false,
      message: '登录失败',
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        this.logger?.log('info', `登录重试 第 ${attempt} 次`, {
          category: 'auth',
          source: 'AuthService',
        });
        await this.sleep(delayMs);
      }

      try {
        lastResult = await this.login(config);
        if (lastResult.success) {
          return lastResult;
        }
      } catch (error) {
        lastResult = {
          success: false,
          message: error instanceof Error ? error.message : '登录异常',
        };
      }
    }

    return lastResult;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 按顺序使用多个账号尝试登录
   */
  async loginWithAccounts(
    accounts: AccountConfig[],
    networkConfig: Omit<LoginConfig, 'serverUrl' | 'userAccount' | 'userPassword' | 'isp'>,
    options: {
      verifyConnectivity?: boolean;
      shouldContinue?: () => boolean;
      retrySingle?: boolean;
    } = {}
  ): Promise<MultiAccountLoginResult> {
    const attempts: MultiAccountLoginAttempt[] = [];
    const verifyConnectivity = options.verifyConnectivity ?? true;

    if (accounts.length === 0) {
      return {
        success: false,
        message: '没有可用的认证账号',
        attempts,
      };
    }

    for (const account of accounts) {
      if (options.shouldContinue && !options.shouldContinue())
        return { success: false, message: '自动认证已暂停', attempts };
      let result: LoginResult;
      try {
        result = await (
          accounts.length === 1 && options.retrySingle
            ? this.loginWithRetry.bind(this)
            : this.login.bind(this)
        )(
          {
            ...networkConfig,
            serverUrl: account.serverUrl,
            userAccount: account.username,
            userPassword: account.password,
            isp: account.isp,
          },
          { verifyConnectivity }
        );
      } catch (error) {
        result = {
          success: false,
          message: error instanceof Error ? error.message : '认证请求失败',
        };
      }

      attempts.push({
        accountId: account.id,
        username: account.username,
        success: result.success,
        message: result.message,
        code: result.code,
      });

      if (result.success) {
        return {
          ...result,
          accountId: account.id,
          attempts,
        };
      }
    }

    const lastAttempt = attempts[attempts.length - 1];
    return {
      success: false,
      message: lastAttempt?.message || '所有账号认证失败',
      code: lastAttempt?.code,
      attempts,
    };
  }

  /**
   * 执行登出
   * 判定对齐生产验证的参考实现与真实抓包：
   * 响应为 JSONP（如 `jsonpReturn({"result":1,"msg":"Radius注销成功！"})`），
   * result === 1 即注销成功（此前误用 result === 0 判定，且依赖 dr1005 回调名，
   * 会把真实成功响应判为失败）。解析不依赖 callback 名，取括号内 JSON。
   */
  async logout(wlanUserIp?: string): Promise<LogoutResult> {
    this.logger?.log('info', `开始登出认证`, {
      category: 'auth',
      source: 'AuthService',
      data: { IP: wlanUserIp || '未提供', 服务器: this.serverUrl },
    });

    try {
      const url = buildLogoutUrl(this.lastSuccessfulServerUrl || this.serverUrl);
      this.logger?.log('debug', '发送门户注销请求', {
        category: 'request',
        source: 'AuthService',
      });

      const response = await httpGet<string>(url, { timeout: 10000 });
      const body = response.rawText;
      this.logger?.log('debug', '已收到门户注销响应', {
        category: 'request',
        source: 'AuthService',
      });

      let success = false;
      let message = '登出失败';

      const payload = extractJsonpPayload(body);
      if (payload) {
        try {
          const data = JSON.parse(payload);
          success = data.result === 1;
          if (typeof data.msg === 'string' && data.msg) {
            message = data.msg;
          }
        } catch {
          // JSON 解析失败，继续走文本匹配回退
        }
      }
      if (!success) {
        success = body.includes('"result":1') || body.includes('"result": 1');
      }

      if (success) {
        this.logger?.log('success', `登出成功: ${message}`, {
          category: 'auth',
          source: 'AuthService',
          data: { IP: wlanUserIp || '未知' },
        });
      } else {
        this.logger?.log('warn', `登出失败: ${message}`, {
          category: 'auth',
          source: 'AuthService',
          data: { IP: wlanUserIp || '未知', 响应: '门户未确认注销' },
        });
      }

      return {
        success,
        message: success ? message : '登出失败',
      };
    } catch (error) {
      this.logger?.log('error', `登出异常`, {
        category: 'auth',
        source: 'AuthService',
        data: {
          IP: wlanUserIp || '未知',
          错误: error instanceof Error ? error.message : String(error),
        },
      });

      if (error instanceof HttpError) {
        throw new AppError(ErrorCode.NETWORK_ERROR, error.message);
      }
      throw new AppError(ErrorCode.AUTH_ERROR, error instanceof Error ? error.message : '未知错误');
    }
  }
}

/**
 * 创建认证服务实例
 */
export function createAuthService(serverUrl?: string, logger?: Logger): AuthService {
  return new AuthService(serverUrl, logger);
}
