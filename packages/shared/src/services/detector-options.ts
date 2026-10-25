/**
 * NetworkDetector 配置与默认延迟目标(自 NetworkDetector 抽出)。
 */

import { DEFAULT_CONNECTIVITY_CHECK_URLS } from '../constants/defaults';

export interface LatencyTarget {
  url: string;
  source: string;
}

export const DEFAULT_PING_TARGETS: LatencyTarget[] = [
  { url: 'https://www.baidu.com', source: '百度' },
  { url: 'https://www.speedtest.cn', source: '测速网' },
];

export interface NetworkDetectorOptions {
  connectivityCheckUrls?: string[];
  connectivityTimeoutMs?: number;
  pingTargets?: LatencyTarget[];
  latencyTimeoutMs?: number;
}

export interface ResolvedNetworkDetectorOptions {
  connectivityCheckUrls: string[];
  connectivityTimeoutMs: number;
  pingTargets: LatencyTarget[];
  latencyTimeoutMs: number;
}

export { DEFAULT_CONNECTIVITY_CHECK_URLS };
