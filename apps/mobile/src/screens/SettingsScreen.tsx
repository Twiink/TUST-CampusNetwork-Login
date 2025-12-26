import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Switch } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { GlassView } from '../components/GlassView';
import { ThemeToggle } from '../components/ThemeToggle';
import { AccountConfig, ISP } from '@repo/shared';

const ISP_OPTIONS: { value: ISP; label: string }[] = [
  { value: 'campus', label: '校园网' },
  { value: 'cmcc', label: '中国移动' },
  { value: 'cucc', label: '中国联通' },
  { value: 'ctcc', label: '中国电信' },
];

export const SettingsScreen: React.FC = () => {
  const { config, setConfig } = useApp();
  const { theme } = useTheme();

  const [newAccount, setNewAccount] = useState<{
    username: string;
    password: string;
    serverUrl: string;
    isp: ISP;
  }>({
    username: '',
    password: '',
    serverUrl: 'http://10.10.102.50:801',
    isp: 'campus',
  });

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
    setNewAccount({
      username: '',
      password: '',
      serverUrl: 'http://10.10.102.50:801',
      isp: 'campus',
    });
  };

  const toggleSetting = (key: string, value: boolean) => {
    setConfig({
      ...config,
      settings: { ...config.settings, [key]: value },
    });
  };

  const getISPLabel = (isp: ISP) => {
    return ISP_OPTIONS.find((opt) => opt.value === isp)?.label || isp;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Theme Toggle */}
        <View style={styles.header}>
          <Text style={[styles.pageTitle, { color: theme.colors.text }]}>配置设置</Text>
          <ThemeToggle />
        </View>

        {/* General Settings Card */}
        <GlassView style={styles.card}>
          <Text style={[styles.cardHeader, { color: theme.colors.text }]}>通用设置</Text>
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
              断线自动重连
            </Text>
            <Switch
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
              thumbColor={config.settings.autoReconnect ? theme.colors.primary : '#f4f3f4'}
              value={config.settings.autoReconnect}
              onValueChange={(v) => toggleSetting('autoReconnect', v)}
            />
          </View>
          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
              开机自动启动
            </Text>
            <Switch
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
              thumbColor={config.settings.autoLaunch ? theme.colors.primary : '#f4f3f4'}
              value={config.settings.autoLaunch}
              onValueChange={(v) => toggleSetting('autoLaunch', v)}
            />
          </View>
        </GlassView>

        {/* Account Management Card */}
        <GlassView style={styles.card}>
          <Text style={[styles.cardHeader, { color: theme.colors.text }]}>账号管理</Text>

          <View style={{ marginBottom: 20 }}>
            {config.accounts.map((acc) => (
              <View
                key={acc.id}
                style={[
                  styles.accountItem,
                  { borderBottomColor: theme.colors.border + '20' },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.accountName, { color: theme.colors.text }]}>
                      {acc.username}
                    </Text>
                    <View
                      style={[
                        styles.ispBadge,
                        {
                          backgroundColor: theme.colors.primary + '20',
                          borderColor: theme.colors.primary + '30',
                        },
                      ]}
                    >
                      <Text style={[styles.ispBadgeText, { color: theme.colors.primary }]}>
                        {getISPLabel(acc.isp)}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.accountUrl, { color: theme.colors.textSecondary }]}>
                    {acc.serverUrl}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.smallBtn,
                    config.currentAccountId === acc.id
                      ? { backgroundColor: theme.colors.border }
                      : { backgroundColor: theme.colors.primary },
                  ]}
                  onPress={() => setConfig({ ...config, currentAccountId: acc.id })}
                  disabled={config.currentAccountId === acc.id}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.smallBtnText,
                      {
                        color:
                          config.currentAccountId === acc.id
                            ? theme.colors.textSecondary
                            : '#fff',
                      },
                    ]}
                  >
                    {config.currentAccountId === acc.id ? '正在使用' : '使用'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <Text style={[styles.subHeader, { color: theme.colors.text }]}>添加新账号</Text>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>用户名</Text>
            <TextInput
              style={[
                styles.formControl,
                {
                  borderColor: theme.colors.border + '40',
                  backgroundColor: theme.colors.cardBg + '80',
                  color: theme.colors.text,
                },
              ]}
              value={newAccount.username}
              onChangeText={(t) => setNewAccount({ ...newAccount, username: t })}
              placeholder="请输入学号/用户名"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>密码</Text>
            <TextInput
              style={[
                styles.formControl,
                {
                  borderColor: theme.colors.border + '40',
                  backgroundColor: theme.colors.cardBg + '80',
                  color: theme.colors.text,
                },
              ]}
              value={newAccount.password}
              onChangeText={(t) => setNewAccount({ ...newAccount, password: t })}
              placeholder="请输入密码"
              placeholderTextColor={theme.colors.textSecondary}
              secureTextEntry
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>服务商</Text>
            <View style={styles.ispGrid}>
              {ISP_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.ispOption,
                    {
                      borderColor: theme.colors.border + '40',
                      backgroundColor: theme.colors.cardBg + '60',
                    },
                    newAccount.isp === opt.value && {
                      backgroundColor: theme.colors.primary + '20',
                      borderColor: theme.colors.primary,
                    },
                  ]}
                  onPress={() => setNewAccount({ ...newAccount, isp: opt.value })}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.ispOptionText,
                      { color: theme.colors.textSecondary },
                      newAccount.isp === opt.value && {
                        color: theme.colors.primary,
                        fontWeight: '600',
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
              服务器地址
            </Text>
            <TextInput
              style={[
                styles.formControl,
                {
                  borderColor: theme.colors.border + '40',
                  backgroundColor: theme.colors.cardBg + '80',
                  color: theme.colors.text,
                },
              ]}
              value={newAccount.serverUrl}
              onChangeText={(t) => setNewAccount({ ...newAccount, serverUrl: t })}
              placeholder="http://..."
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.btnPrimary,
              {
                backgroundColor: theme.colors.primary,
                shadowColor: theme.colors.primary,
              },
            ]}
            onPress={handleAddAccount}
            activeOpacity={0.8}
          >
            <Text style={styles.btnText}>保存并添加账号</Text>
          </TouchableOpacity>
        </GlassView>

        {/* Other Settings Card */}
        <GlassView style={styles.card}>
          <Text style={[styles.cardHeader, { color: theme.colors.text }]}>其他</Text>
          <Text style={[styles.otherText, { color: theme.colors.textSecondary }]}>
            WiFi 自动连接功能即将推出...
          </Text>
        </GlassView>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 0,
  },
  card: {
    padding: 24,
    marginBottom: 24,
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    paddingBottom: 16,
  },
  subHeader: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    marginTop: 8,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  accountName: {
    fontSize: 17,
    fontWeight: '700',
  },
  accountUrl: {
    fontSize: 13,
    marginTop: 4,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  formControl: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  btnPrimary: {
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  btnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  smallBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 50,
  },
  smallBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  ispBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
    borderWidth: 1,
  },
  ispBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  ispGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  ispOption: {
    width: '48%',
    padding: 12,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
  },
  ispOptionText: {
    fontWeight: '500',
  },
  otherText: {
    fontSize: 14,
  },
});
