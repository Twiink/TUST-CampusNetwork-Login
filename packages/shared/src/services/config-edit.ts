import type { AccountConfig, AppConfig, WifiConfig } from '../types/config';
import { validateAccountConfig, validateWifiConfig } from '../utils/validator';

export function editAccount(
  config: AppConfig,
  id: string,
  draft: Partial<Omit<AccountConfig, 'id'>>,
  password = ''
): AppConfig {
  const previous = config.accounts.find((a) => a.id === id);
  if (!previous) throw new Error('账号已被删除，请刷新');
  const account = {
    ...previous,
    ...draft,
    username: (draft.username ?? previous.username).trim(),
    serverUrl: (draft.serverUrl ?? previous.serverUrl).trim(),
    password: password || previous.password,
    id,
  };
  if (config.accounts.some((a) => a.id !== id && a.username === account.username))
    throw new Error('该用户名已存在');
  const validation = validateAccountConfig(account);
  if (!validation.valid) throw new Error(validation.errors.join('；'));
  return { ...config, accounts: config.accounts.map((a) => (a.id === id ? account : a)) };
}
export function editWifi(
  config: AppConfig,
  id: string,
  draft: Partial<Omit<WifiConfig, 'id' | 'password'>>,
  password = '',
  clearPassword = false
): AppConfig {
  const previous = config.wifiList.find((w) => w.id === id);
  if (!previous) throw new Error('WiFi 已被删除，请刷新');
  const linkedAccountIds =
    draft.requiresAuth === false ? [] : (draft.linkedAccountIds ?? previous.linkedAccountIds);
  const wifi = {
    ...previous,
    ...draft,
    ssid: (draft.ssid ?? previous.ssid).trim(),
    id,
    linkedAccountIds,
    linkedAccountId: linkedAccountIds[0],
    password: clearPassword ? '' : password || previous.password,
  };
  if (
    config.wifiList.some(
      (w) =>
        w.id !== id &&
        w.ssid === wifi.ssid &&
        (w.security ?? '') === (wifi.security ?? '') &&
        (w.bssid ?? '') === (wifi.bssid ?? '')
    )
  )
    throw new Error('该 WiFi 配置已存在');
  const validation = validateWifiConfig(wifi);
  if (!validation.valid) throw new Error(validation.errors.join('；'));
  return { ...config, wifiList: config.wifiList.map((w) => (w.id === id ? wifi : w)) };
}
export function moveLinkedAccount(ids: string[], id: string, direction: -1 | 1): string[] {
  const result = [...ids],
    index = result.indexOf(id),
    target = index + direction;
  if (index >= 0 && target >= 0 && target < result.length)
    [result[index], result[target]] = [result[target], result[index]];
  return result;
}
