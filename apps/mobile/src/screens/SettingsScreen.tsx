import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { AccountConfig, WifiConfig } from '@repo/shared';
import { GeneralSettingsCard } from '../components/settings/GeneralSettingsCard';
import { AccountsCard } from '../components/settings/AccountsCard';
import { WifiConfigCard } from '../components/settings/WifiConfigCard';
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
  const { config, setConfig } = useApp();
  const { theme } = useTheme();

  const [newAccount, setNewAccount] = useState<NewAccountForm>(DEFAULT_NEW_ACCOUNT);
  const [newWifi, setNewWifi] = useState<NewWifiForm>(DEFAULT_NEW_WIFI);

  const handleAddAccount = () => {
    if (!newAccount.username || !newAccount.password) return;
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
    const updatedAccounts = config.accounts.filter(a => a.id !== id);
    const updatedWifiList = config.wifiList.map(wifi => {
      return {
        ...wifi,
        linkedAccountIds: wifi.linkedAccountIds.filter(accountId => accountId !== id),
      };
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
    if (!newWifi.ssid) return;
    if (newWifi.requiresAuth && newWifi.linkedAccountIds.length === 0) {
      return;
    }
    const wifi: WifiConfig = {
      id: Date.now().toString(),
      ssid: newWifi.ssid,
      password: newWifi.password,
      autoConnect: true,
      requiresAuth: newWifi.requiresAuth,
      linkedAccountIds: newWifi.requiresAuth ? newWifi.linkedAccountIds : [],
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
    setConfig({
      ...config,
      wifiList: config.wifiList.filter(w => w.id !== id),
    });
  };

  const toggleSetting = (key: string, value: boolean | number) => {
    setConfig({
      ...config,
      settings: { ...config.settings, [key]: value },
    });
  };

  const toggleNotificationSetting = (
    key: keyof typeof config.settings.notificationSettings,
    value: boolean
  ) => {
    setConfig({
      ...config,
      settings: {
        ...config.settings,
        notificationSettings: {
          ...config.settings.notificationSettings,
          [key]: value,
        },
      },
    });
  };

  const handleSwitchAccount = (id: string) => {
    setConfig({ ...config, currentAccountId: id });
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
        />
      </ScrollView>
    </View>
  );
};
