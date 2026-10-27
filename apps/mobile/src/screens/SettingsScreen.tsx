import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import {
  AccountConfig,
  WifiConfig,
  generateId,
  validateAccountConfig,
  validateWifiConfig,
} from '@repo/shared';
import { GeneralSettingsCard } from '../components/settings/GeneralSettingsCard';
import { AccountsCard } from '../components/settings/AccountsCard';
import { WifiConfigCard } from '../components/settings/WifiConfigCard';
import { PermissionsCard } from '../components/settings/PermissionsCard';
import {
  DEFAULT_NEW_ACCOUNT,
  DEFAULT_NEW_WIFI,
  type NewAccountForm,
  type NewWifiForm,
} from '../components/settings/shared';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
});

export const SettingsScreen: React.FC = () => {
  const { config, setConfig, permissionItems, requestAppPermission, runPermissionGuide } = useApp();
  const { theme } = useTheme();

  const [newAccount, setNewAccount] = useState<NewAccountForm>(DEFAULT_NEW_ACCOUNT);
  const [newWifi, setNewWifi] = useState<NewWifiForm>(DEFAULT_NEW_WIFI);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [wifiError, setWifiError] = useState<string | null>(null);

  const handleAddAccount = () => {
    const username = newAccount.username.trim();
    if (!username || !newAccount.password) {
      setAccountError('请输入用户名和密码');
      return;
    }
    if (config.accounts.some(account => account.username === username)) {
      setAccountError('该用户名已存在');
      return;
    }

    const account: AccountConfig = {
      id: generateId(),
      name: username,
      username,
      password: newAccount.password,
      serverUrl: newAccount.serverUrl,
      isp: newAccount.isp,
    };
    const validation = validateAccountConfig(account);
    if (!validation.valid) {
      setAccountError(validation.errors[0] || '账号配置格式无效');
      return;
    }

    setAccountError(null);
    setConfig(current => ({
      ...current,
      accounts: [...current.accounts, account],
      currentAccountId: current.currentAccountId || account.id,
    }));
    setNewAccount(DEFAULT_NEW_ACCOUNT);
  };

  const handleRemoveAccount = (id: string) => {
    setConfig(current => {
      const updatedAccounts = current.accounts.filter(account => account.id !== id);
      const updatedWifiList = current.wifiList.map(wifi => {
        const linkedAccountIds = wifi.linkedAccountIds.filter(accountId => accountId !== id);
        return {
          ...wifi,
          linkedAccountIds,
          linkedAccountId: linkedAccountIds[0],
        };
      });

      return {
        ...current,
        accounts: updatedAccounts,
        wifiList: updatedWifiList,
        currentAccountId:
          current.currentAccountId === id
            ? updatedAccounts.length > 0
              ? updatedAccounts[0].id
              : null
            : current.currentAccountId,
      };
    });
  };

  const handleAddWifi = () => {
    const ssid = newWifi.ssid.trim();
    if (!ssid) {
      setWifiError('请输入 WiFi 名称');
      return;
    }
    if (config.wifiList.some(wifi => wifi.ssid === ssid)) {
      setWifiError('该 WiFi 配置已存在');
      return;
    }
    if (newWifi.requiresAuth && newWifi.linkedAccountIds.length === 0) {
      setWifiError('需要认证的 WiFi 必须选择关联账号');
      return;
    }

    const linkedAccountIds = newWifi.requiresAuth ? newWifi.linkedAccountIds : [];
    const wifi: WifiConfig = {
      id: generateId(),
      ssid,
      password: newWifi.password,
      autoConnect: true,
      requiresAuth: newWifi.requiresAuth,
      linkedAccountIds,
      linkedAccountId: linkedAccountIds[0],
      priority: newWifi.priority,
      lastConnectedAt: null,
    };
    const validation = validateWifiConfig(wifi);
    if (!validation.valid) {
      setWifiError(validation.errors[0] || 'WiFi 配置格式无效');
      return;
    }

    setWifiError(null);
    setConfig(current => ({
      ...current,
      wifiList: [...current.wifiList, wifi],
    }));
    setNewWifi(DEFAULT_NEW_WIFI);
  };

  const handleRemoveWifi = (id: string) => {
    setConfig(current => ({
      ...current,
      wifiList: current.wifiList.filter(wifi => wifi.id !== id),
    }));
  };

  const toggleSetting = (key: string, value: boolean | number) => {
    setConfig(current => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }));
  };

  const toggleNotificationSetting = (
    key: keyof typeof config.settings.notificationSettings,
    value: boolean
  ) => {
    setConfig(current => ({
      ...current,
      settings: {
        ...current.settings,
        notificationSettings: {
          ...current.settings.notificationSettings,
          [key]: value,
        },
      },
    }));
  };

  const handleSwitchAccount = (id: string) => {
    setConfig(current => ({ ...current, currentAccountId: id }));
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Page Title */}
        <Text style={[styles.pageTitle, { color: theme.colors.text }]}>配置设置</Text>

        <GeneralSettingsCard
          settings={config.settings}
          onToggleSetting={toggleSetting}
          onToggleNotificationSetting={toggleNotificationSetting}
        />

        <PermissionsCard
          items={permissionItems}
          onRequest={item => {
            requestAppPermission(item.key).catch(() => undefined);
          }}
          onRunGuide={() => {
            runPermissionGuide().catch(() => undefined);
          }}
        />

        <AccountsCard
          accounts={config.accounts}
          currentAccountId={config.currentAccountId}
          newAccount={newAccount}
          setNewAccount={setNewAccount}
          error={accountError}
          onAddAccount={handleAddAccount}
          onRemoveAccount={handleRemoveAccount}
          onSwitchAccount={handleSwitchAccount}
        />

        <WifiConfigCard
          wifiList={config.wifiList}
          accounts={config.accounts}
          newWifi={newWifi}
          setNewWifi={setNewWifi}
          error={wifiError}
          onAddWifi={handleAddWifi}
          onRemoveWifi={handleRemoveWifi}
        />
      </ScrollView>
    </View>
  );
};
