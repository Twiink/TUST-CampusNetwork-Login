/**
 * 登录认证服务
 */

import type { LoginConfig, LoginResult, LogoutResult } from '../types/auth';
import type { ISP } from '../types/config';
import type { Logger } from '../models/Logger';
import { httpGet, HttpError } from '../utils/httpClient';
import { urlencode, buildQueryString } from '../utils/urlEncode';
import { DEFAULT_SERVER_URL } from '../constants/defaults';
import { ErrorCode, AppError } from '../constants/errors';

/**
 * ISP 到账号前缀的映射
 */
const ISP_PREFIX_MAP: Record<ISP, string> = {
  campus: '', // 校园网无前缀
  cmcc: '@cmcc', // 中国移动
  cucc: '@cucc', // 中国联通
  ctcc: '@ctcc', // 中国电信
};

/**
 * 认证服务类
 */
export class AuthService {
  private serverUrl: string;
  private logger: Logger | null;

  constructor(serverUrl: string = DEFAULT_SERVER_URL, logger?: Logger) {
    this.serverUrl = serverUrl;
    this.logger = logger || null;
  }

  /**
   * 设置服务器地址
   */
  setServerUrl(url: string): void {
    this.serverUrl = url;
    this.logger?.info(`认证服务器地址已更新: ${url}`);
  }

  /**
   * 获取服务器地址
   */
  getServerUrl(): string {
    return this.serverUrl;
  }

  /**
   * 构建用户账号 (添加 ISP 前缀)
   */
  private buildUserAccount(username: string, isp: ISP): string {
    const prefix = ISP_PREFIX_MAP[isp] || '';
    return username + prefix;
  }

  /**
   * 构建登录 URL
   */
  buildLoginUrl(config: LoginConfig): string {
    const userAccount = this.buildUserAccount(config.userAccount, config.isp);

    const params: Record<string, string | number> = {
      callback: 'dr1009',
      login_method: 1,
      user_account: userAccount,
      user_password: config.userPassword,
      wlan_user_ip: config.wlanUserIp,
      wlan_user_mac: config.wlanUserMac || '000000000000',
      wlan_ac_ip: '10.10.102.49',
      wlan_ac_name: '',
      jsVersion: '4.1.3',
      terminal_type: 3,
      lang: 'zh-cn',
      v: Date.now(),
    };

    // 添加 IPv6 (需要编码)
    if (config.wlanUserIpv6) {
      params.wlan_user_ipv6 = urlencode(config.wlanUserIpv6);
    }

    const serverUrl = config.serverUrl || this.serverUrl;
    const queryString = buildQueryString(params);

    return `${serverUrl}/eportal/portal/login?${queryString}`;
  }

  /**
   * 解析登录响应
   */
  parseLoginResponse(response: string): LoginResult {
    // 响应格式: dr1009({"result":1,"msg":"Portal协议认证成功！"})
    // 或者: dr1009({"result":0,"msg":"用户名或密码错误"})

    try {
      // 提取 JSON 部分
      const jsonMatch = response.match(/dr1009\((.*)\)/);
      if (!jsonMatch || !jsonMatch[1]) {
        return {
          success: false,
          message: '响应格式无效',
          rawResponse: response,
        };
      }

      const data = JSON.parse(jsonMatch[1]);
      const success = data.result === 1 || data.result === '1';

      return {
        success,
        message: data.msg || (success ? '登录成功' : '登录失败'),
        code: data.result,
        rawResponse: response,
      };
    } catch {
      return {
        success: false,
        message: '解析响应失败',
        rawResponse: response,
      };
    }
  }

  /**
   * 执行登录
   */
  async login(config: LoginConfig): Promise<LoginResult> {
    const userAccount = this.buildUserAccount(config.userAccount, config.isp);
    const ispName = config.isp === 'campus' ? '校园网' :
                    config.isp === 'cmcc' ? '中国移动' :
                    config.isp === 'cucc' ? '中国联通' : '中国电信';

    this.logger?.info(`开始登录认证`, {
      用户: userAccount,
      运营商: ispName,
      IP: config.wlanUserIp,
      服务器: config.serverUrl || this.serverUrl,
    });

    try {
      const url = this.buildLoginUrl(config);
      this.logger?.debug(`请求登录 URL: ${url.substring(0, 100)}...`);

      const response = await httpGet<string>(url, { timeout: 10000 });
      const result = this.parseLoginResponse(response.rawText);

      if (result.success) {
        this.logger?.success(`登录成功: ${result.message}`, { 用户: userAccount });
      } else {
        this.logger?.warn(`登录失败: ${result.message}`, {
          用户: userAccount,
          错误码: result.code,
        });
      }

      return result;
    } catch (error) {
      this.logger?.error(`登录异常`, {
        用户: userAccount,
        错误: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof HttpError) {
        throw new AppError(ErrorCode.NETWORK_ERROR, error.message, { originalError: error });
      }
      throw new AppError(ErrorCode.AUTH_ERROR, error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 构建登出 URL
   */
  buildLogoutUrl(wlanUserIp: string): string {
    const params: Record<string, string | number> = {
      callback: 'dr1009',
      wlan_user_ip: wlanUserIp,
      wlan_user_mac: '000000000000',
      v: Date.now(),
    };

    const queryString = buildQueryString(params);
    return `${this.serverUrl}/eportal/portal/logout?${queryString}`;
  }

  /**
   * 执行登出
   */
  async logout(wlanUserIp: string): Promise<LogoutResult> {
    this.logger?.info(`开始登出认证`, {
      IP: wlanUserIp,
      服务器: this.serverUrl,
    });

    try {
      const url = this.buildLogoutUrl(wlanUserIp);
      this.logger?.debug(`请求登出 URL: ${url.substring(0, 100)}...`);

      const response = await httpGet<string>(url, { timeout: 10000 });

      // 简单判断登出是否成功
      const success = response.rawText.includes('result":1') || response.rawText.includes('成功');

      if (success) {
        this.logger?.success(`登出成功`, { IP: wlanUserIp });
      } else {
        this.logger?.warn(`登出失败`, { IP: wlanUserIp });
      }

      return {
        success,
        message: success ? '登出成功' : '登出失败',
      };
    } catch (error) {
      this.logger?.error(`登出异常`, {
        IP: wlanUserIp,
        错误: error instanceof Error ? error.message : String(error),
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
