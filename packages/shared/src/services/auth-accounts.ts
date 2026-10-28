import type { AccountConfig, AppConfig } from '../types/config';
import { matchWifiRule, type WifiIdentity } from './wifi-identity';
/** All entry points use the same ordered WiFi account selection policy. */
export function resolveLoginAccounts(
  config: AppConfig,
  identity?: string | WifiIdentity | null
): AccountConfig[] {
  const input = typeof identity === 'string' ? { ssid: identity } : identity;
  const wifi = input ? matchWifiRule(config.wifiList, input) : null;
  if (input && !wifi && config.wifiList.some((w) => w.ssid === input.ssid)) return [];
  const ids = new Set(
    wifi?.linkedAccountIds?.length
      ? wifi.linkedAccountIds
      : wifi?.linkedAccountId
        ? [wifi.linkedAccountId]
        : []
  );
  const linked = [...ids]
    .map((id) => config.accounts.find((a) => a.id === id))
    .filter((a): a is AccountConfig => !!a);
  if (linked.length) return linked;
  const current = config.accounts.find((a) => a.id === config.currentAccountId);
  return current ? [current] : [];
}
