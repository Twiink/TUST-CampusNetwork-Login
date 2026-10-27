import type { AccountConfig, AppConfig } from '../types/config';
/** All entry points use the same ordered WiFi account selection policy. */
export function resolveLoginAccounts(config: AppConfig, ssid?: string | null): AccountConfig[] {
  const wifi = config.wifiList
    .filter((w) => w.ssid === ssid)
    .sort((a, b) => a.priority - b.priority)[0];
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
