import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { GlassView } from '../components/GlassView';
import { AccountConfig, WifiConfig, ISP } from '@repo/shared';

/* eslint-disable react-native/no-inline-styles */
// Inline styles are necessary in this file for dynamic theming based on theme context

const ISP_OPTIONS: { value: ISP; label: string }[] = [
  { value: 'campus', label: '校园网' },
  { value: 'cmcc', label: '中国移动' },
  { value: 'cucc', label: '中国联通' },
  { value: 'ctcc', label: '中国电信' },
];

// 根据优先级返回对应的颜色
const getPriorityColor = (priority: number): string => {
  if (priority <= 3) return '#ef4444'; // 红色 - 最高优先级
  if (priority <= 6) return '#f97316'; // 橙色 - 高优先级
  if (priority <= 10) return '#3b82f6'; // 蓝色 - 中等优先级
  if (priority <= 20) return '#22c55e'; // 绿色 - 低优先级
  return '#6b7280'; // 灰色 - 最低优先级
};

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

  const [newWifi, setNewWifi] = useState<{
    ssid: string;
    password: string;
    requiresAuth: boolean;
    linkedAccountIds: string[];
    priority: number;
  }>({
    ssid: '',
    password: '',
    requiresAuth: true,
    linkedAccountIds: [],
    priority: 10,
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
    setNewWifi({
      ssid: '',
      password: '',
      requiresAuth: true,
      linkedAccountIds: [],
      priority: 10,
    });
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

  const getISPLabel = (isp: ISP) => {
    return ISP_OPTIONS.find(opt => opt.value === isp)?.label || isp;
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

        {/* General Settings Card */}
        <GlassView style={styles.card}>
          <Text style={[styles.cardHeader, { color: theme.colors.text }]}>通用设置</Text>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>开机自动启动</Text>
            <Switch
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
              thumbColor={config.settings.autoLaunch ? theme.colors.primary : '#f4f3f4'}
              value={config.settings.autoLaunch}
              onValueChange={v => toggleSetting('autoLaunch', v)}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>启用心跳检测</Text>
              <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                自动检测网络连接状态
              </Text>
            </View>
            <Switch
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
              thumbColor={config.settings.enableHeartbeat ? theme.colors.primary : '#f4f3f4'}
              value={config.settings.enableHeartbeat}
              onValueChange={v => toggleSetting('enableHeartbeat', v)}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>断线自动重连</Text>
            <Switch
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
              thumbColor={config.settings.autoReconnect ? theme.colors.primary : '#f4f3f4'}
              value={config.settings.autoReconnect}
              onValueChange={v => toggleSetting('autoReconnect', v)}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>启动时自动连接</Text>
            <Switch
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
              thumbColor={config.settings.startupAutoConnect ? theme.colors.primary : '#f4f3f4'}
              value={config.settings.startupAutoConnect}
              onValueChange={v => toggleSetting('startupAutoConnect', v)}
            />
          </View>

          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>保持当前连接</Text>
            <Switch
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
              thumbColor={config.settings.keepCurrentConnection ? theme.colors.primary : '#f4f3f4'}
              value={config.settings.keepCurrentConnection}
              onValueChange={v => toggleSetting('keepCurrentConnection', v)}
            />
          </View>

          {config.settings.enableHeartbeat && (
            <>
              <View style={[styles.divider, { backgroundColor: theme.colors.border + '30' }]} />

              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                    心跳检测间隔
                  </Text>
                  <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                    当前值: {config.settings.heartbeatIntervalSeconds} 秒
                  </Text>
                </View>
              </View>

              <View style={styles.sliderContainer}>
                <TextInput
                  style={[
                    styles.numberInput,
                    {
                      borderColor: theme.colors.border + '40',
                      backgroundColor: theme.colors.cardBg + '80',
                      color: theme.colors.text,
                    },
                  ]}
                  value={String(config.settings.heartbeatIntervalSeconds)}
                  onChangeText={text => {
                    const value = parseInt(text, 10) || 5;
                    if (value >= 5 && value <= 300) {
                      toggleSetting('heartbeatIntervalSeconds', value);
                    }
                  }}
                  keyboardType="number-pad"
                  placeholder="5-300"
                  placeholderTextColor={theme.colors.textSecondary}
                />
                <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>秒</Text>
              </View>

              <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                    连续失败阈值
                  </Text>
                  <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                    当前值: {config.settings.heartbeatFailureThreshold} 次
                  </Text>
                </View>
              </View>

              <View style={[styles.sliderContainer, { marginBottom: 0 }]}>
                <TextInput
                  style={[
                    styles.numberInput,
                    {
                      borderColor: theme.colors.border + '40',
                      backgroundColor: theme.colors.cardBg + '80',
                      color: theme.colors.text,
                    },
                  ]}
                  value={String(config.settings.heartbeatFailureThreshold)}
                  onChangeText={text => {
                    const value = parseInt(text, 10) || 1;
                    if (value >= 1 && value <= 10) {
                      toggleSetting('heartbeatFailureThreshold', value);
                    }
                  }}
                  keyboardType="number-pad"
                  placeholder="1-10"
                  placeholderTextColor={theme.colors.textSecondary}
                />
                <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>次</Text>
              </View>

              <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                    单个 WiFi 重试次数
                  </Text>
                  <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                    当前值: {config.settings.wifiReconnectRetries} 次
                  </Text>
                </View>
              </View>

              <View style={styles.sliderContainer}>
                <TextInput
                  style={[
                    styles.numberInput,
                    {
                      borderColor: theme.colors.border + '40',
                      backgroundColor: theme.colors.cardBg + '80',
                      color: theme.colors.text,
                    },
                  ]}
                  value={String(config.settings.wifiReconnectRetries)}
                  onChangeText={text => {
                    const value = parseInt(text, 10) || 0;
                    if (value >= 0 && value <= 10) {
                      toggleSetting('wifiReconnectRetries', value);
                    }
                  }}
                  keyboardType="number-pad"
                  placeholder="0-10"
                  placeholderTextColor={theme.colors.textSecondary}
                />
                <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>次</Text>
              </View>

              <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                    冷却期时长
                  </Text>
                  <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                    当前值: {config.settings.wifiReconnectCooldownMinutes} 分钟
                  </Text>
                </View>
              </View>

              <View style={[styles.sliderContainer, { marginBottom: 0 }]}>
                <TextInput
                  style={[
                    styles.numberInput,
                    {
                      borderColor: theme.colors.border + '40',
                      backgroundColor: theme.colors.cardBg + '80',
                      color: theme.colors.text,
                    },
                  ]}
                  value={String(config.settings.wifiReconnectCooldownMinutes)}
                  onChangeText={text => {
                    const value = parseInt(text, 10) || 0;
                    if (value >= 0 && value <= 60) {
                      toggleSetting('wifiReconnectCooldownMinutes', value);
                    }
                  }}
                  keyboardType="number-pad"
                  placeholder="0-60"
                  placeholderTextColor={theme.colors.textSecondary}
                />
                <Text style={[styles.inputLabel, { color: theme.colors.textSecondary }]}>分</Text>
              </View>
            </>
          )}
        </GlassView>

        <GlassView style={styles.card}>
          <Text style={[styles.cardHeader, { color: theme.colors.text }]}>通知设置</Text>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>WiFi 断开</Text>
            <Switch
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
              thumbColor={
                config.settings.notificationSettings.wifiDisconnected
                  ? theme.colors.primary
                  : '#f4f3f4'
              }
              value={config.settings.notificationSettings.wifiDisconnected}
              onValueChange={v => toggleNotificationSetting('wifiDisconnected', v)}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>自动重连成功</Text>
            <Switch
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
              thumbColor={
                config.settings.notificationSettings.reconnectSuccess
                  ? theme.colors.primary
                  : '#f4f3f4'
              }
              value={config.settings.notificationSettings.reconnectSuccess}
              onValueChange={v => toggleNotificationSetting('reconnectSuccess', v)}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
              自动重连全部失败
            </Text>
            <Switch
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
              thumbColor={
                config.settings.notificationSettings.reconnectFailed
                  ? theme.colors.primary
                  : '#f4f3f4'
              }
              value={config.settings.notificationSettings.reconnectFailed}
              onValueChange={v => toggleNotificationSetting('reconnectFailed', v)}
            />
          </View>

          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>认证恢复成功</Text>
            <Switch
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
              thumbColor={
                config.settings.notificationSettings.authRecovered
                  ? theme.colors.primary
                  : '#f4f3f4'
              }
              value={config.settings.notificationSettings.authRecovered}
              onValueChange={v => toggleNotificationSetting('authRecovered', v)}
            />
          </View>
        </GlassView>

        {/* Account Management Card */}
        <GlassView style={styles.card}>
          <Text style={[styles.cardHeader, { color: theme.colors.text }]}>账号管理</Text>

          <View style={{ marginBottom: 20 }}>
            {config.accounts.map(acc => (
              <View
                key={acc.id}
                style={[styles.accountItem, { borderBottomColor: theme.colors.border + '20' }]}
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
                <View style={styles.accountActions}>
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
                      {config.currentAccountId === acc.id ? '使用中' : '使用'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.deleteBtn, { backgroundColor: theme.colors.danger + '20' }]}
                    onPress={() => handleRemoveAccount(acc.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.deleteBtnText, { color: theme.colors.danger }]}>删除</Text>
                  </TouchableOpacity>
                </View>
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
              onChangeText={t => setNewAccount({ ...newAccount, username: t })}
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
              onChangeText={t => setNewAccount({ ...newAccount, password: t })}
              placeholder="请输入密码"
              placeholderTextColor={theme.colors.textSecondary}
              secureTextEntry
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>服务商</Text>
            <View style={styles.ispGrid}>
              {ISP_OPTIONS.map(opt => (
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
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>服务器地址</Text>
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
              onChangeText={t => setNewAccount({ ...newAccount, serverUrl: t })}
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

        {/* WiFi Configuration Card */}
        <GlassView style={styles.card}>
          <Text style={[styles.cardHeader, { color: theme.colors.text }]}>WiFi 配置</Text>
          <Text
            style={[styles.settingDesc, { color: theme.colors.textSecondary, marginBottom: 16 }]}
          >
            配置需要自动连接的 WiFi 网络。启用心跳检测后，断线时会按优先级尝试切换网络。
          </Text>

          <View style={{ marginBottom: 20 }}>
            {config.wifiList.length === 0 ? (
              <View
                style={{
                  padding: 20,
                  alignItems: 'center',
                  backgroundColor: theme.colors.cardBg + '40',
                  borderRadius: 16,
                }}
              >
                <Text style={{ color: theme.colors.textSecondary }}>暂无 WiFi 配置</Text>
              </View>
            ) : (
              config.wifiList.map(wifi => {
                const linkedAccounts = config.accounts.filter(a =>
                  wifi.linkedAccountIds.includes(a.id)
                );
                return (
                  <View
                    key={wifi.id}
                    style={[styles.accountItem, { borderBottomColor: theme.colors.border + '20' }]}
                  >
                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          marginBottom: 4,
                        }}
                      >
                        <Text
                          style={[styles.accountName, { color: theme.colors.text, marginRight: 8 }]}
                        >
                          {wifi.ssid}
                        </Text>
                        <View
                          style={[
                            styles.ispBadge,
                            {
                              backgroundColor: wifi.requiresAuth ? '#fef3c7' : '#d1fae5',
                              borderColor: 'transparent',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.ispBadgeText,
                              { color: wifi.requiresAuth ? '#92400e' : '#065f46' },
                            ]}
                          >
                            {wifi.requiresAuth ? '需要认证' : '无需认证'}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.ispBadge,
                            {
                              backgroundColor: getPriorityColor(wifi.priority || 10) + '20',
                              borderColor: 'transparent',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.ispBadgeText,
                              { color: getPriorityColor(wifi.priority || 10) },
                            ]}
                          >
                            ⭐ 优先级 {wifi.priority || 10}
                          </Text>
                        </View>
                      </View>
                      {wifi.requiresAuth && (
                        <Text style={[styles.accountUrl, { color: theme.colors.textSecondary }]}>
                          关联账号:{' '}
                          {linkedAccounts.length > 0
                            ? linkedAccounts
                                .map(account => `${account.username} (${getISPLabel(account.isp)})`)
                                .join(' / ')
                            : '未关联 (可能已删除)'}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={[styles.deleteBtn, { backgroundColor: theme.colors.danger + '20' }]}
                      onPress={() => handleRemoveWifi(wifi.id)}
                    >
                      <Text style={[styles.deleteBtnText, { color: theme.colors.danger }]}>
                        删除
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>

          <Text style={[styles.subHeader, { color: theme.colors.text }]}>添加 WiFi</Text>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
              WiFi 名称 (SSID)
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
              value={newWifi.ssid}
              onChangeText={t => setNewWifi({ ...newWifi, ssid: t })}
              placeholder="请输入 WiFi 名称"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>WiFi 密码</Text>
            <TextInput
              style={[
                styles.formControl,
                {
                  borderColor: theme.colors.border + '40',
                  backgroundColor: theme.colors.cardBg + '80',
                  color: theme.colors.text,
                },
              ]}
              value={newWifi.password}
              onChangeText={t => setNewWifi({ ...newWifi, password: t })}
              placeholder="请输入 WiFi 密码（可选）"
              placeholderTextColor={theme.colors.textSecondary}
              secureTextEntry
            />
          </View>

          <View style={styles.settingRow}>
            <View>
              <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                需要校园网认证
              </Text>
              <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                关闭则视为家庭/热点网络
              </Text>
            </View>
            <Switch
              trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
              thumbColor={newWifi.requiresAuth ? theme.colors.primary : '#f4f3f4'}
              value={newWifi.requiresAuth}
              onValueChange={v => setNewWifi({ ...newWifi, requiresAuth: v, linkedAccountIds: [] })}
            />
          </View>

          {newWifi.requiresAuth && (
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>关联账号</Text>
              {config.accounts.length === 0 ? (
                <Text style={{ color: theme.colors.danger, fontSize: 14 }}>
                  请先在上方「账号管理」添加账号
                </Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {config.accounts.map(acc => (
                    <TouchableOpacity
                      key={acc.id}
                      style={[
                        styles.ispOption,
                        {
                          width: '100%',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          marginBottom: 8,
                        },
                        newWifi.linkedAccountIds.includes(acc.id)
                          ? {
                              backgroundColor: theme.colors.primary + '20',
                              borderColor: theme.colors.primary,
                            }
                          : {
                              borderColor: theme.colors.border + '40',
                              backgroundColor: theme.colors.cardBg + '60',
                            },
                      ]}
                      onPress={() =>
                        setNewWifi(prev => ({
                          ...prev,
                          linkedAccountIds: prev.linkedAccountIds.includes(acc.id)
                            ? prev.linkedAccountIds.filter(accountId => accountId !== acc.id)
                            : [...prev.linkedAccountIds, acc.id],
                        }))
                      }
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.ispOptionText,
                          {
                            color: newWifi.linkedAccountIds.includes(acc.id)
                              ? theme.colors.primary
                              : theme.colors.textSecondary,
                          },
                        ]}
                      >
                        {acc.username}
                      </Text>
                      <View
                        style={[
                          styles.ispBadge,
                          {
                            backgroundColor: theme.colors.primary + '20',
                            borderColor: theme.colors.primary + '30',
                            marginLeft: 8,
                          },
                        ]}
                      >
                        <Text style={[styles.ispBadgeText, { color: theme.colors.primary }]}>
                          {getISPLabel(acc.isp)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* 优先级配置 */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>优先级</Text>
            <TextInput
              style={[
                styles.formControl,
                {
                  backgroundColor: theme.colors.cardBg,
                  color: theme.colors.text,
                  borderColor: theme.colors.border,
                },
              ]}
              placeholder="请输入优先级（1-99，数字越小优先级越高）"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="number-pad"
              value={String(newWifi.priority || 10)}
              onChangeText={text => {
                const value = parseInt(text, 10) || 10;
                setNewWifi({ ...newWifi, priority: Math.min(99, Math.max(1, value)) });
              }}
            />
            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 6 }}>
              数字越小优先级越高（1=最高，99=最低，默认=10）
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.btnPrimary,
              {
                backgroundColor: theme.colors.primary,
                opacity:
                  (newWifi.requiresAuth && newWifi.linkedAccountIds.length === 0) || !newWifi.ssid
                    ? 0.5
                    : 1,
              },
            ]}
            onPress={handleAddWifi}
            disabled={
              (newWifi.requiresAuth && newWifi.linkedAccountIds.length === 0) || !newWifi.ssid
            }
            activeOpacity={0.8}
          >
            <Text style={styles.btnText}>添加 WiFi</Text>
          </TouchableOpacity>
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
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 32,
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
  settingDesc: {
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  numberInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  accountActions: {
    flexDirection: 'row',
    gap: 8,
  },
  accountName: {
    fontSize: 17,
    fontWeight: '700',
  },
  accountUrl: {
    fontSize: 13,
    marginTop: 4,
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
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 50,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: '700',
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
