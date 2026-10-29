import { normalizeWifiSecurity, type WifiConfig } from '@repo/shared';

export function usesSystemWifiSettings(security?: string): boolean {
  return ['enterprise', 'wep'].includes(normalizeWifiSecurity(security));
}

export function normalizeMobileWifiRules(rules: WifiConfig[]): WifiConfig[] {
  return rules.map(rule =>
    rule.autoConnect && usesSystemWifiSettings(rule.security)
      ? { ...rule, autoConnect: false }
      : rule
  );
}
