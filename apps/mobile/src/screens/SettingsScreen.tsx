import { UpdateCard } from '../components/settings/UpdateCard';
import React, { useState } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { ConfigEditor, type EditingTarget } from '../components/settings/ConfigEditor';
import { NearbyWifi } from '../components/settings/NearbyWifi';
import { connectToWifi, openWifiSettings } from '../native/WifiModule';
import { Pressable } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import {
  AccountConfig,
  WifiConfig,
  generateId,
  validateAccountConfig,
  validateWifiConfig,
  resolveWifiSecurity,
  sameWifiFingerprint,
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
  saveState: { paddingHorizontal: 16 },
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
  const {
    config,
    setConfig,
    permissionItems,
    requestAppPermission,
    runPermissionGuide,
    configurationState,
    configurationError,
    retryConfigurationSync,
    addLog,
  } = useApp();
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const { theme } = useTheme();

  const [newAccount, setNewAccount] = useState<NewAccountForm>(DEFAULT_NEW_ACCOUNT);
  const [newWifi, setNewWifi] = useState<NewWifiForm>(DEFAULT_NEW_WIFI);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [wifiError, setWifiError] = useState<string | null>(null);

  const saveConfig = async (update: Parameters<typeof setConfig>[0]): Promise<boolean> => {
    try {
      await setConfig(update);
      return true;
    } catch (error) {
      addLog?.('error', error instanceof Error ? error.message : '保存失败，请重试');
      return false;
    }
  };
  const handleAddAccount = async () => {
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
    const saved = await saveConfig(current => ({
      ...current,
      accounts: [...current.accounts, account],
      currentAccountId: current.currentAccountId || account.id,
    }));
    if (saved) setNewAccount(DEFAULT_NEW_ACCOUNT);
  };

  const handleRemoveAccount = (id: string) => {
    saveConfig(current => {
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

  const handleAddWifi = async () => {
    const ssid = newWifi.ssid.trim();
    if (!ssid) {
      setWifiError('请输入 WiFi 名称');
      return;
    }
    if (
      config.wifiList.some(
        wifi =>
          wifi.ssid === ssid &&
          ((!newWifi.security && !newWifi.bssid) ||
            sameWifiFingerprint(wifi, {
              ssid,
              security: resolveWifiSecurity(newWifi.security, newWifi.password),
              bssid: newWifi.bssid,
            }))
      )
    ) {
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
      autoConnect: newWifi.autoConnect ?? true,
      security: resolveWifiSecurity(newWifi.security, newWifi.password),
      bssid: newWifi.bssid,
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
    const saved = await saveConfig(current => ({
      ...current,
      wifiList: [...current.wifiList, wifi],
    }));
    if (saved) setNewWifi(DEFAULT_NEW_WIFI);
  };

  const handleRemoveWifi = (id: string) => {
    saveConfig(current => ({
      ...current,
      wifiList: current.wifiList.filter(wifi => wifi.id !== id),
    }));
  };

  const toggleSetting = (key: string, value: boolean | number) => {
    saveConfig(current => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }));
  };

  const toggleNotificationSetting = (
    key: keyof typeof config.settings.notificationSettings,
    value: boolean
  ) => {
    saveConfig(current => ({
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
    saveConfig(current => ({ ...current, currentAccountId: id }));
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      {configurationState === 'saved' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.saveState, { color: theme.colors.textSecondary }]}
        >
          配置已保存并同步
        </Text>
      ) : null}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Page Title */}
        <Text style={[styles.pageTitle, { color: theme.colors.text }]}>配置设置</Text>

        {configurationState === 'saving' || configurationState === 'syncing' ? (
          <Text accessibilityLiveRegion="polite">正在保存并同步后台…</Text>
        ) : null}
        {configurationError ? (
          <View>
            <Text accessibilityRole="alert">{configurationError}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                retryConfigurationSync().catch(() => undefined);
              }}
            >
              <Text style={{ color: theme.colors.text }}>重试配置同步</Text>
            </Pressable>
          </View>
        ) : null}
        {config.settings.autoAuthPaused ? (
          <View>
            <Text style={{ color: theme.colors.text }}>自动认证已暂停</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                saveConfig(current => ({
                  ...current,
                  settings: { ...current.settings, autoAuthPaused: false },
                }))
              }
            >
              <Text style={{ color: theme.colors.text }}>恢复自动认证</Text>
            </Pressable>
          </View>
        ) : null}
        <GeneralSettingsCard
          settings={config.settings}
          onToggleSetting={toggleSetting}
          onToggleNotificationSetting={toggleNotificationSetting}
        />

        <UpdateCard />
        <PermissionsCard
          items={permissionItems}
          onRequest={item => {
            requestAppPermission(item.key).catch(() => undefined);
          }}
          onRunGuide={() => {
            runPermissionGuide().catch(() => undefined);
          }}
        />

        <NearbyWifi
          config={config}
          onSelect={network =>
            setNewWifi(current => ({
              ...current,
              ssid: network.ssid ?? '',
              security: network.security ?? undefined,
              bssid: network.bssid ?? undefined,
            }))
          }
          onEdit={id => setEditing({ kind: 'wifi', id })}
        />
        <AccountsCard
          onEditAccount={id => setEditing({ kind: 'account', id })}
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
          onEditWifi={id => setEditing({ kind: 'wifi', id })}
          onToggleAutoConnect={id => {
            saveConfig(current => ({
              ...current,
              wifiList: current.wifiList.map(wifi =>
                wifi.id === id ? { ...wifi, autoConnect: !wifi.autoConnect } : wifi
              ),
            }));
          }}
          onConnectWifi={id => {
            const wifi = config.wifiList.find(item => item.id === id);
            if (!wifi) return;
            addLog?.('info', `正在连接 ${wifi.ssid}，请确认系统 WiFi 授权`);
            connectToWifi(wifi.ssid, wifi.password, wifi.security, wifi.bssid, wifi.id)
              .then(success => {
                if (!success) return openWifiSettings();
              })
              .catch(error => {
                const message = error instanceof Error ? error.message : 'WiFi 连接失败';
                addLog?.('warn', message);
                Alert.alert('无法连接 WiFi', message);
              });
          }}
          wifiList={config.wifiList}
          accounts={config.accounts}
          newWifi={newWifi}
          setNewWifi={setNewWifi}
          error={wifiError}
          onAddWifi={handleAddWifi}
          onRemoveWifi={handleRemoveWifi}
        />
        {editing ? (
          <ConfigEditor
            key={`${editing.kind}-${editing.id}`}
            config={config}
            target={editing}
            onSave={setConfig}
            onClose={() => setEditing(null)}
          />
        ) : null}
      </ScrollView>
    </View>
  );
};
