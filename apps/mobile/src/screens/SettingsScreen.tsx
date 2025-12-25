import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Switch } from 'react-native';
import { useApp } from '../context/AppContext';
import { theme } from '../constants/theme';
import { AccountConfig, ISP } from '@repo/shared';

const ISP_OPTIONS: { value: ISP; label: string }[] = [
  { value: 'campus', label: '校园网' },
  { value: 'cmcc', label: '中国移动' },
  { value: 'cucc', label: '中国联通' },
  { value: 'ctcc', label: '中国电信' },
];

export const SettingsScreen: React.FC = () => {
  const { config, setConfig } = useApp();
  const [newAccount, setNewAccount] = useState<{
    username: string;
    password: string;
    serverUrl: string;
    isp: ISP;
  }>({ 
    username: '', 
    password: '', 
    serverUrl: 'http://10.10.102.50:801',
    isp: 'campus'
  });

  const handleAddAccount = () => {
    if (!newAccount.username || !newAccount.password) return;
    const account: AccountConfig = {
      id: Date.now().toString(),
      name: newAccount.username,
      username: newAccount.username,
      password: newAccount.password,
      serverUrl: newAccount.serverUrl,
      isp: newAccount.isp
    };
    
    setConfig({
      ...config,
      accounts: [...config.accounts, account],
      currentAccountId: config.currentAccountId || account.id
    });
    setNewAccount({ username: '', password: '', serverUrl: 'http://10.10.102.50:801', isp: 'campus' });
  };

  const toggleSetting = (key: string, value: boolean) => {
    setConfig({
        ...config,
        settings: { ...config.settings, [key]: value }
    });
  };

  const getISPLabel = (isp: ISP) => {
    return ISP_OPTIONS.find(opt => opt.value === isp)?.label || isp;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.pageTitle}>配置设置</Text>

      {/* General Settings Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>通用设置</Text>
        <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>断线自动重连</Text>
            <Switch 
                trackColor={{ false: "rgba(0,0,0,0.1)", true: "#bae6fd" }}
                thumbColor={config.settings.autoReconnect ? theme.colors.primary : "#f4f3f4"}
                value={config.settings.autoReconnect} 
                onValueChange={(v) => toggleSetting('autoReconnect', v)} 
            />
        </View>
        <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.settingLabel}>开机自动启动</Text>
            <Switch 
                trackColor={{ false: "rgba(0,0,0,0.1)", true: "#bae6fd" }}
                thumbColor={config.settings.autoLaunch ? theme.colors.primary : "#f4f3f4"}
                value={config.settings.autoLaunch} 
                onValueChange={(v) => toggleSetting('autoLaunch', v)} 
            />
        </View>
      </View>

      {/* Account Management Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>账号管理</Text>
        
        <View style={{ marginBottom: 20 }}>
          {config.accounts.map(acc => (
              <View key={acc.id} style={styles.accountItem}>
                  <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.accountName}>{acc.username}</Text>
                        <View style={styles.ispBadge}>
                          <Text style={styles.ispBadgeText}>{getISPLabel(acc.isp)}</Text>
                        </View>
                      </View>
                      <Text style={styles.accountUrl}>{acc.serverUrl}</Text>
                  </View>
                  <TouchableOpacity 
                      style={[styles.smallBtn, config.currentAccountId === acc.id ? styles.btnDisabled : styles.btnActive]}
                      onPress={() => setConfig({ ...config, currentAccountId: acc.id })}
                      disabled={config.currentAccountId === acc.id}
                  >
                      <Text style={[styles.smallBtnText, config.currentAccountId === acc.id ? { color: '#94a3b8' } : { color: '#fff' }]}>
                          {config.currentAccountId === acc.id ? '正在使用' : '使用'}
                      </Text>
                  </TouchableOpacity>
              </View>
          ))}
        </View>

        <Text style={styles.subHeader}>添加新账号</Text>
        
        <View style={styles.formGroup}>
            <Text style={styles.label}>用户名</Text>
            <TextInput 
                style={styles.formControl} 
                value={newAccount.username} 
                onChangeText={t => setNewAccount({...newAccount, username: t})}
                placeholder="请输入学号/用户名"
                placeholderTextColor="#94a3b8"
            />
        </View>

        <View style={styles.formGroup}>
            <Text style={styles.label}>密码</Text>
            <TextInput 
                style={styles.formControl} 
                value={newAccount.password} 
                onChangeText={t => setNewAccount({...newAccount, password: t})}
                placeholder="请输入密码"
                placeholderTextColor="#94a3b8"
                secureTextEntry
            />
        </View>

        <View style={styles.formGroup}>
            <Text style={styles.label}>服务商</Text>
            <View style={styles.ispGrid}>
              {ISP_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.ispOption,
                    newAccount.isp === opt.value && styles.ispOptionActive
                  ]}
                  onPress={() => setNewAccount({...newAccount, isp: opt.value})}
                >
                  <Text style={[
                    styles.ispOptionText,
                    newAccount.isp === opt.value && styles.ispOptionTextActive
                  ]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
        </View>

        <View style={styles.formGroup}>
            <Text style={styles.label}>服务器地址</Text>
            <TextInput 
                style={styles.formControl} 
                value={newAccount.serverUrl} 
                onChangeText={t => setNewAccount({...newAccount, serverUrl: t})}
                placeholder="http://..."
                placeholderTextColor="#94a3b8"
            />
        </View>

        <TouchableOpacity style={styles.btnPrimary} onPress={handleAddAccount}>
            <Text style={styles.btnText}>保存并添加账号</Text>
        </TouchableOpacity>
      </View>
      
      {/* Other Settings Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>其他</Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>WiFi 自动连接功能即将推出...</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
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
    color: '#0c4a6e',
    marginTop: 0,
  },
  card: {
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.roundness.l,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 32,
    elevation: 4,
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0c4a6e',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(14, 165, 233, 0.1)',
  },
  subHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
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
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  accountName: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
  },
  accountUrl: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  formControl: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)', // Very light border
    borderRadius: theme.roundness.m,
    paddingHorizontal: 16,
    paddingVertical: 12, // Desktop: 14px
    backgroundColor: 'rgba(255, 255, 255, 0.4)', // More transparent
    fontSize: 16,
    color: theme.colors.text,
  },
  btnPrimary: {
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: theme.roundness.m,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  btnText: { 
    color: '#fff', 
    fontWeight: '600',
    fontSize: 16 
  },
  smallBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.roundness.pill,
  },
  btnActive: {
    backgroundColor: theme.colors.primary,
  },
  btnDisabled: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  smallBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  ispBadge: {
    backgroundColor: 'rgba(14, 165, 233, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.1)',
  },
  ispBadgeText: {
    fontSize: 10,
    color: '#0369a1',
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
    borderRadius: theme.roundness.m,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  ispOptionActive: {
    backgroundColor: 'rgba(14, 165, 233, 0.1)',
    borderColor: theme.colors.primary,
  },
  ispOptionText: {
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  ispOptionTextActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
});