/**
 * 认证请求 URL 构建与账号格式化(自 AuthService 抽出,对齐真实抓包格式)。
 */

import type { ISP } from '../types/config';
import type { LoginConfig } from '../types/auth';
import { buildQueryString } from '../utils/urlEncode';

const ISP_SUFFIX_MAP: Record<string, string> = {
  campus: '', // 校园网无后缀
  cmcc: '@cmcc', // 中国移动
  cucc: '@unicom', // 中国联通 (抓包显示后缀为 unicom)
  ctcc: '@telecom', // 中国电信 (抓包显示后缀为 telecom)
};

/**
 * 构建登录 URL
 * 完全对齐生产验证的参考实现（真实抓包）：callback=dr1005、v=9303（固定值）、
 * 不携带 wlan_ac_ip/wlan_ac_name（参考实现均无这两个参数）。
 */
export function buildLoginUrl(serverUrl: string, config: LoginConfig): string {
  const userAccount = buildUserAccount(config.userAccount, config.isp);

  const params: Record<string, string | number> = {
    callback: 'dr1005',
    login_method: 1,
    user_account: userAccount,
    user_password: config.userPassword,
    wlan_user_ip: config.wlanUserIp,
    // 对齐参考实现：固定传全零。官方门户 JS 拿不到真实 MAC，门户实际忽略该字段。
    wlan_user_mac: '000000000000',
    jsVersion: '4.1.3',
    terminal_type: 3, // 对齐生产验证的参考实现（此前为 1）
    lang: 'zh-cn',
    v: 9303,
  };

  // 添加 IPv6（buildQueryString 会自动 URL 编码，无需手动处理）
  if (config.wlanUserIpv6) {
    params.wlan_user_ipv6 = config.wlanUserIpv6;
  }

  const resolvedServerUrl = config.serverUrl || serverUrl;
  const queryString = buildQueryString(params);

  return `${resolvedServerUrl}/eportal/portal/login?${queryString}`;
}

/**
 * 构建登出 URL
 * 对齐生产验证的参考实现：直接 GET 注销端点，不携带查询参数。
 * @param _wlanUserIp 仅用于日志（参考实现的注销请求不依赖本机 IP）
 */
export function buildLogoutUrl(serverUrl: string): string {
  return `${serverUrl}/eportal/portal/logout`;
}

/**
 * 构建用户账号
 * 格式: ",0{学号}@{运营商后缀}"
 * 根据抓包结果，账号格式为: ,023103421 (校园网) 或 ,023103421@unicom (联通)
 */
export function buildUserAccount(username: string, isp: ISP): string {
  const suffix = ISP_SUFFIX_MAP[isp] || '';
  // 添加 ",0," 前缀（抓包格式: %2C0%2C23103421 = ,0,23103421）
  return `,0,${username}${suffix}`;
}
