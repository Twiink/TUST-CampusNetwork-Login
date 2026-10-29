import {
  resolveLoginAccounts,
  type AuthService,
  type ConfigManager,
  type NetworkDetector,
  type LoginResult,
  type MultiAccountLoginResult,
  type StorageAdapter,
  type NetworkStatus,
  type AccountConfig,
  normalizeBssid,
  normalizeWifiSecurity,
} from '@repo/shared';
import { resolveNetworkInfo, getCurrentWifiSSID } from './network';

interface SessionRecord {
  serverUrl: string;
  accountId: string;
  network: string;
}
const sessionBindings = new WeakMap<
  AuthService,
  { storage: StorageAdapter; detector: NetworkDetector }
>();
const SESSION_KEY = 'auth_session';
const networkKey = (status: NetworkStatus) =>
  JSON.stringify([
    status.wifiConnected,
    status.ssid ?? null,
    normalizeBssid(status.bssid),
    normalizeWifiSecurity(status.security),
    status.ip ?? null,
  ]);

export function configureAuthSession(
  auth: AuthService,
  storage: StorageAdapter,
  detector: NetworkDetector
): void {
  sessionBindings.set(auth, { storage, detector });
}

export async function freshAuthStatus(
  auth: AuthService,
  fallback?: NetworkStatus | null
): Promise<NetworkStatus | null> {
  return sessionBindings.get(auth)?.detector.getNetworkStatus({ fresh: true }) ?? fallback ?? null;
}

export async function recordSuccessfulLogin(
  auth: AuthService,
  result: MultiAccountLoginResult,
  accounts: AccountConfig[],
  status: NetworkStatus | null
): Promise<void> {
  const binding = sessionBindings.get(auth);
  if (result.success && !result.cancelled && status)
    binding?.detector.rememberAuthentication?.(status, true);
  const account = accounts.find((entry) => entry.id === result.accountId);
  if (binding && result.success && !result.cancelled && account && status)
    await binding.storage.set<SessionRecord>(SESSION_KEY, {
      serverUrl: account.serverUrl,
      accountId: account.id,
      network: networkKey(status),
    });
}

export async function invalidateAuthSession(
  auth: AuthService,
  status: NetworkStatus,
  current: () => boolean = () => true
): Promise<void> {
  const binding = sessionBindings.get(auth);
  if (!binding) return;
  await auth.runExclusive(async () => {
    if (!current()) return;
    const record = await binding.storage.get<SessionRecord>(SESSION_KEY);
    if (current() && record && record.network !== networkKey(status))
      await binding.storage.remove(SESSION_KEY);
  });
}

export async function authNetworkInfo(status: NetworkStatus | null, serverUrl?: string) {
  if (status?.wifiConnected || status?.ip)
    return { ipv4: status.ip ?? null, ipv6: status.ipv6, mac: status.mac };
  return resolveNetworkInfo(serverUrl);
}

export async function manualLogin(
  auth: AuthService,
  config: ConfigManager,
  detector?: NetworkDetector
): Promise<LoginResult> {
  await config.updateSettings({ autoAuthPaused: false });
  return auth.runExclusive(async () => {
    const status = detector
      ? await detector.getNetworkStatus({ fresh: true })
      : await freshAuthStatus(auth);
    const ssid = status?.ssid ?? (await getCurrentWifiSSID()).ssid;
    const snapshot = config.getConfig()!;
    const identity = status?.ssid ? { ...status, ssid: status.ssid } : ssid;
    const accounts = resolveLoginAccounts(snapshot, identity);
    const current = async () => {
      if (config.getSettings().autoAuthPaused || config.getConfig()?.revision !== snapshot.revision)
        return false;
      const now = await detector?.getNetworkStatus({ fresh: true });
      return (
        !detector ||
        (!!now &&
          ['ssid', 'bssid', 'security', 'ip', 'wifiConnected'].every(
            (key) => now[key as keyof typeof now] === status?.[key as keyof typeof status]
          ))
      );
    };
    if (!accounts.length) return { success: false, message: '请先选择或添加账户' };
    const network = await authNetworkInfo(status, accounts[0].serverUrl);
    if (!network.ipv4) return { success: false, message: '无法获取本机 IP 地址' };
    const result = await auth.loginWithAccounts(
      accounts,
      {
        wlanUserIp: network.ipv4,
        wlanUserIpv6: network.ipv6 || undefined,
        wlanUserMac: network.mac || undefined,
      },
      { retrySingle: true, shouldContinue: current }
    );
    await recordSuccessfulLogin(auth, result, accounts, status);
    return result;
  });
}

export async function manualLogout(
  auth: AuthService,
  config: ConfigManager,
  detector?: NetworkDetector
) {
  // Commit the pause before waiting for an in-flight login; logout must be the last request.
  await config.updateSettings({ autoAuthPaused: true });
  return auth.runExclusive(async () => {
    const status = detector
      ? await detector.getNetworkStatus({ fresh: true })
      : await freshAuthStatus(auth);
    const binding = sessionBindings.get(auth);
    const session = await binding?.storage.get<SessionRecord>(SESSION_KEY);
    const accounts = resolveLoginAccounts(
      config.getConfig()!,
      status?.ssid ? { ...status, ssid: status.ssid } : null
    );
    const portals = [...new Set(accounts.map((account) => account.serverUrl))];
    const server =
      session && status && session.network === networkKey(status)
        ? session.serverUrl
        : portals.length === 1
          ? portals[0]
          : null;
    if (!server)
      return { success: false, message: '无法确定当前会话的认证服务器，请重新登录后注销' };
    const network = await authNetworkInfo(status, server);
    const result = await auth.logout(network.ipv4 || undefined, server);
    if (result.success) {
      await binding?.storage.remove(SESSION_KEY);
      if (status) (detector ?? binding?.detector)?.rememberAuthentication?.(status, false);
    }
    return result;
  });
}
