/**
 * 认证相关类型定义
 */

import type { ISP } from './config';

/**
 * 登录配置
 */
export interface LoginConfig {
  /** 认证服务器地址 */
  serverUrl: string;
  /** 用户账号 */
  userAccount: string;
  /** 用户密码 */
  userPassword: string;
  /** 用户 IPv4 地址 */
  wlanUserIp: string;
  /** 用户 IPv6 地址 (可选) */
  wlanUserIpv6?: string;
  /** 用户 MAC 地址 (可选) */
  wlanUserMac?: string;
  /** 服务商 */
  isp: ISP;
}

/**
 * 登录参数 (用于构建 URL)
 */
export interface LoginParams {
  callback: string;
  loginMethod: number;
  userAccount: string;
  userPassword: string;
  wlanUserIp: string;
  wlanUserIpv6?: string;
  wlanUserMac?: string;
  wlanAcIp?: string;
  wlanAcName?: string;
  jsVersion?: string;
  terminalType?: number;
  lang?: string;
  v?: number;
}

/**
 * 登录结果
 */
export interface LoginResult {
  /** 是否成功 */
  success: boolean;
  /** 结果消息 */
  message: string;
  /** 响应代码 */
  code?: number;
  /** 原始响应数据 */
  rawResponse?: string;
}

/**
 * 登出结果
 */
export interface LogoutResult {
  /** 是否成功 */
  success: boolean;
  /** 结果消息 */
  message: string;
}

/**
 * 认证状态
 */
export type AuthStatus = 'idle' | 'authenticating' | 'authenticated' | 'failed';
