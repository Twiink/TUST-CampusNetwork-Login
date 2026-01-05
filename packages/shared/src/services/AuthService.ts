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
 * ISP 到账号后缀的映射
 * 注意：根据抓包结果，运营商后缀为 unicom/cmcc/telecom
 */
const ISP_SUFFIX_MAP: Record<string, string> = {
  campus: '',       // 校园网无后缀
  cmcc: '@cmcc',    // 中国移动
  unicom: '@unicom', // 中国联通 (抓包显示)
  telecom: '@telecom', // 中国电信 (抓包显示)
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
   * 构建用户账号
   * 格式: ",0{学号}@{运营商后缀}"
   * 根据抓包结果，账号格式为: ,023103421 (校园网) 或 ,023103421@unicom (联通)
   */
  private buildUserAccount(username: string, isp: ISP): string {
    const suffix = ISP_SUFFIX_MAP[isp] || '';
    // 添加 ",0" 前缀
    return `,0${username}${suffix}`;
  }

  /**
   * 构建登录 URL
   * 根据抓包结果，callback 为 dr1005
   */
  buildLoginUrl(config: LoginConfig): string {
    const userAccount = this.buildUserAccount(config.userAccount, config.isp);

    const params: Record<string, string | number> = {
      callback: 'dr1005', // 抓包结果显示为 dr1005
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
   * 响应格式: dr1005({"result":0,"msg":"...","ret_code":2})
   * 根据抓包结果，ret_code=0 或 1 表示失败，ret_code=2 表示已在线
   */
  parseLoginResponse(response: string): LoginResult {
    // 响应格式: dr1005({"result":0,"msg":"用户名或密码错误","ret_code":1})

    try {
      // 提取 JSON 部分
      const jsonMatch = response.match(/dr1005\((.*)\)/);
      if (!jsonMatch || !jsonMatch[1]) {
        return {
          success: false,
          message: '响应格式无效',
          rawResponse: response,
        };
      }

      const data = JSON.parse(jsonMatch[1]);
      // 根据抓包结果：ret_code=0 成功，ret_code=1 失败，ret_code=2 已在线
      const retCode = data.ret_code;
      const isSuccess = retCode === 0 || retCode === 2;

      return {
        success: isSuccess,
        message: data.msg || (isSuccess ? '登录成功' : '登录失败'),
        code: retCode,
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
                    config.isp === 'unicom' ? '中国联通' : '中国电信';

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
      callback: 'dr1005', // 抓包结果显示为 dr1005
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
