import {
  resolveLoginAccounts,
  type AuthService,
  type ConfigManager,
  type NetworkDetector,
  type LoginResult,
} from '@repo/shared';
import { resolveNetworkInfo, getCurrentWifiSSID } from './network';

export async function manualLogin(
  auth: AuthService,
  config: ConfigManager,
  detector?: NetworkDetector
): Promise<LoginResult> {
  await config.updateSettings({ autoAuthPaused: false });
  return auth.runExclusive(async () => {
    const status = detector ? await detector.getNetworkStatus() : null;
    const ssid = status?.ssid ?? (await getCurrentWifiSSID()).ssid;
    const accounts = resolveLoginAccounts(config.getConfig()!, ssid);
    if (!accounts.length) return { success: false, message: '请先选择或添加账户' };
    const network = status?.ip
      ? { ipv4: status.ip, ipv6: status.ipv6, mac: status.mac }
      : await resolveNetworkInfo();
    if (!network.ipv4) return { success: false, message: '无法获取本机 IP 地址' };
    return auth.loginWithAccounts(
      accounts,
      {
        wlanUserIp: network.ipv4,
        wlanUserIpv6: network.ipv6 || undefined,
        wlanUserMac: network.mac || undefined,
      },
      { retrySingle: true }
    );
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
    const status = await detector?.getNetworkStatus();
    const network = status?.ip ? { ipv4: status.ip } : await resolveNetworkInfo();
    return auth.logout(network.ipv4 || undefined);
  });
}
