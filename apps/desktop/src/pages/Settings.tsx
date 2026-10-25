import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { AccountConfig, WifiConfig } from '@repo/shared';
import { Settings as SettingsIcon } from 'lucide-react';
import { GeneralSettingsCard } from '../components/settings/GeneralSettingsCard';
import { AccountsCard } from '../components/settings/AccountsCard';
import { WifiConfigCard } from '../components/settings/WifiConfigCard';
import {
  DEFAULT_NEW_ACCOUNT,
  DEFAULT_NEW_WIFI,
  type NewAccountForm,
  type NewWifiForm,
} from '../components/settings/shared';

export const Settings: React.FC = () => {
  const { config, setConfig } = useApp();
  const [newAccount, setNewAccount] = useState<NewAccountForm>(DEFAULT_NEW_ACCOUNT);
  const [newWifi, setNewWifi] = useState<NewWifiForm>(DEFAULT_NEW_WIFI);

  const handleAddAccount = () => {
    if (!newAccount.username || !newAccount.password || !config) return;
    const account: AccountConfig = {
      id: Date.now().toString(),
      name: newAccount.username,
      username: newAccount.username,
      password: newAccount.password,
      serverUrl: newAccount.serverUrl,
      isp: newAccount.isp,
    };

    setConfig({
      ...config,
      accounts: [...config.accounts, account],
      currentAccountId: config.currentAccountId || account.id,
    });
    setNewAccount(DEFAULT_NEW_ACCOUNT);
  };

  const handleRemoveAccount = (id: string) => {
    if (!config) return;
    const updatedAccounts = config.accounts.filter((a) => a.id !== id);
    // 同时更新引用了该账号的 WiFi 配置
    const updatedWifiList = config.wifiList.map((wifi) => {
      if (wifi.linkedAccountId === id) {
        return { ...wifi, linkedAccountId: undefined };
      }
      return wifi;
    });
    setConfig({
      ...config,
      accounts: updatedAccounts,
      wifiList: updatedWifiList,
      currentAccountId:
        config.currentAccountId === id
          ? updatedAccounts.length > 0
            ? updatedAccounts[0].id
            : null
          : config.currentAccountId,
    });
  };

  const handleAddWifi = () => {
    if (!newWifi.ssid || !config) return;
    // 如果需要认证但没选择账号，提示用户
    if (newWifi.requiresAuth && !newWifi.linkedAccountId) {
      alert('需要认证的 WiFi 必须选择关联账号');
      return;
    }
    const wifi: WifiConfig = {
      id: Date.now().toString(),
      ssid: newWifi.ssid,
      password: newWifi.password,
      autoConnect: newWifi.autoConnect,
      requiresAuth: newWifi.requiresAuth,
      linkedAccountIds:
        newWifi.requiresAuth && newWifi.linkedAccountId ? [newWifi.linkedAccountId] : [],
      linkedAccountId: newWifi.requiresAuth ? newWifi.linkedAccountId : undefined,
      priority: newWifi.priority,
      lastConnectedAt: null,
    };

    setConfig({
      ...config,
      wifiList: [...config.wifiList, wifi],
    });
    setNewWifi(DEFAULT_NEW_WIFI);
  };

  const handleRemoveWifi = (id: string) => {
    if (!config) return;
    setConfig({
      ...config,
      wifiList: config.wifiList.filter((w) => w.id !== id),
    });
  };

  // 切换WiFi自动重连状态
  const handleToggleWifiAutoConnect = (id: string) => {
    if (!config) return;
    setConfig({
      ...config,
      wifiList: config.wifiList.map((w) =>
        w.id === id ? { ...w, autoConnect: !w.autoConnect } : w
      ),
    });
  };

  const handleSettingChange = (key: string, value: unknown) => {
    if (!config) return;
    setConfig({
      ...config,
      settings: { ...config.settings, [key]: value },
    });
  };

  const handleSwitchAccount = (id: string) => {
    if (!config) return;
    setConfig({ ...config, currentAccountId: id });
  };

  return (
    <div className="page-settings">
      <h1 className="page-title">
        <SettingsIcon size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
        配置设置
      </h1>

      {!config ? (
        <div className="card">
          <p>加载中...</p>
        </div>
      ) : (
        <>
          <GeneralSettingsCard settings={config.settings} onSettingChange={handleSettingChange} />
          <AccountsCard
            accounts={config.accounts}
            currentAccountId={config.currentAccountId}
            newAccount={newAccount}
            setNewAccount={setNewAccount}
            onAddAccount={handleAddAccount}
            onRemoveAccount={handleRemoveAccount}
            onSwitchAccount={handleSwitchAccount}
          />
          <WifiConfigCard
            wifiList={config.wifiList}
            accounts={config.accounts}
            newWifi={newWifi}
            setNewWifi={setNewWifi}
            onAddWifi={handleAddWifi}
            onRemoveWifi={handleRemoveWifi}
            onToggleAutoConnect={handleToggleWifiAutoConnect}
          />
        </>
      )}
    </div>
  );
};
