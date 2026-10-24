/**
 * 校园网判定工具
 * 对齐生产验证的参考实现（tust-portal-desktop network_info.rs 的 check_network_status）：
 * SSID 前缀 TUST/CU_TUST 且本机 IPv4 位于 10.x 网段即视为校园网。
 */

/** 校园网 SSID 前缀（大小写不敏感） */
const CAMPUS_SSID_PREFIXES = ['TUST', 'CU_TUST'];

/**
 * 判断是否为校园网环境
 * 双条件对齐参考实现：SSID 前缀匹配 + 本机 IPv4 为 10.x。
 * IP 缺失时保守返回 false（不触发自动认证）。
 */
export function isCampusNetwork(ssid: string | null | undefined, ipv4?: string | null): boolean {
  if (!ssid || !ipv4) {
    return false;
  }

  const normalized = ssid.toUpperCase();
  const ssidMatch = CAMPUS_SSID_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  return ssidMatch && ipv4.startsWith('10.');
}
