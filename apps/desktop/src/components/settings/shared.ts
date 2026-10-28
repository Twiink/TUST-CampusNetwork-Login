/**
 * 设置页共享定义：表单类型、默认值与服务商/优先级展示辅助
 */

import type { ISP } from '@repo/shared';

export const ISP_OPTIONS: { value: ISP; label: string }[] = [
  { value: 'campus', label: '校园网' },
  { value: 'cmcc', label: '中国移动' },
  { value: 'cucc', label: '中国联通' },
  { value: 'ctcc', label: '中国电信' },
];

export interface NewAccountForm {
  username: string;
  password: string;
  serverUrl: string;
  isp: ISP;
}

export const DEFAULT_NEW_ACCOUNT: NewAccountForm = {
  username: '',
  password: '',
  serverUrl: 'http://10.10.102.50:801',
  isp: 'campus',
};

export interface NewWifiForm {
  security?: string;
  bssid?: string;
  ssid: string;
  password: string;
  requiresAuth: boolean;
  autoConnect: boolean;
  linkedAccountId: string;
  priority: number;
}

export const DEFAULT_NEW_WIFI: NewWifiForm = {
  ssid: '',
  password: '',
  requiresAuth: true,
  autoConnect: true,
  linkedAccountId: '',
  priority: 10,
};

export const getISPLabel = (isp: ISP): string => {
  return ISP_OPTIONS.find((opt) => opt.value === isp)?.label || isp;
};

// 根据优先级返回对应的颜色
export const getPriorityColor = (priority: number): string => {
  if (priority <= 3) return '#ef4444'; // 红色 - 最高优先级
  if (priority <= 6) return '#f97316'; // 橙色 - 高优先级
  if (priority <= 10) return '#3b82f6'; // 蓝色 - 中等优先级
  if (priority <= 20) return '#22c55e'; // 绿色 - 低优先级
  return '#6b7280'; // 灰色 - 最低优先级
};
