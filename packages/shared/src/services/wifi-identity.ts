import type { WifiConfig } from '../types/config';

export interface WifiIdentity {
  ssid: string;
  security?: string | null;
  bssid?: string | null;
}

export function normalizeWifiSecurity(value?: string | null): string {
  const text = (value ?? '').toUpperCase();
  if (!text || text === 'UNKNOWN') return '';
  if (/EAP|ENTERPRISE|企业/.test(text)) return 'enterprise';
  if (/WEP/.test(text)) return 'wep';
  if (/SAE|WPA3/.test(text)) return /PSK|WPA2/.test(text) ? 'wpa2-wpa3' : 'wpa3';
  if (/WPA2|RSN/.test(text)) return 'wpa2';
  if (/WPA|PSK/.test(text)) return 'wpa2';
  if (/OPEN|NONE|开放|^--$/.test(text)) return 'open';
  return text.toLowerCase();
}

export function wifiSecurityMatches(expected: string, actual: string): boolean {
  return expected === actual || (expected === 'wpa2-wpa3' && ['wpa2', 'wpa3'].includes(actual));
}

export function normalizeBssid(value?: string | null): string {
  const text = (value ?? '').replace(/[:-]/g, '').toLowerCase();
  return /^[0-9a-f]{12}$/.test(text) && text !== '020000000000' ? text : '';
}

export function sameWifiFingerprint(left: WifiIdentity, right: WifiIdentity): boolean {
  return (
    left.ssid === right.ssid &&
    normalizeWifiSecurity(left.security) === normalizeWifiSecurity(right.security) &&
    normalizeBssid(left.bssid) === normalizeBssid(right.bssid)
  );
}

export function matchWifiRule<
  T extends Pick<WifiConfig, 'ssid' | 'security' | 'bssid' | 'priority'> & {
    lastConnectedAt?: number | null;
  },
>(rules: T[], identity: WifiIdentity): T | null {
  const security = normalizeWifiSecurity(identity.security),
    bssid = normalizeBssid(identity.bssid);
  const score = (rule: T): number => {
    const expectedSecurity = normalizeWifiSecurity(rule.security),
      expectedBssid = normalizeBssid(rule.bssid);
    if (rule.ssid !== identity.ssid || (rule.bssid && (!bssid || bssid !== expectedBssid)))
      return -1;
    if (
      expectedSecurity &&
      !wifiSecurityMatches(expectedSecurity, security) &&
      !(expectedBssid && !security)
    )
      return -1;
    return expectedBssid ? 3 : expectedSecurity ? 2 : 1;
  };
  const selected =
    rules
      .filter((rule) => score(rule) > 0)
      .sort(
        (a, b) =>
          score(b) - score(a) ||
          a.priority - b.priority ||
          (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0)
      )[0] ?? null;
  // A missing fingerprint must not silently choose a less specific rule.
  const unresolved = rules.some(
    (rule) =>
      (normalizeBssid(rule.bssid) ? 3 : normalizeWifiSecurity(rule.security) ? 2 : 1) >
        (selected ? score(selected) : 0) &&
      rule.ssid === identity.ssid &&
      (!normalizeWifiSecurity(rule.security) ||
        !security ||
        wifiSecurityMatches(normalizeWifiSecurity(rule.security), security)) &&
      (!rule.bssid || !bssid || normalizeBssid(rule.bssid) === bssid) &&
      ((!!rule.bssid && !bssid) ||
        (!!normalizeWifiSecurity(rule.security) && !security && !normalizeBssid(rule.bssid)))
  );
  return unresolved ? null : selected;
}
