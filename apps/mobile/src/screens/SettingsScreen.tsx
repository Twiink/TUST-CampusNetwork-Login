import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Switch } from 'react-native';
import { useApp } from '../context/AppContext';
import { theme } from '../constants/theme';
import { AccountConfig } from '@repo/shared';

export const SettingsScreen: React.FC = () => {
  const { config, setConfig } = useApp();
  const [newAccount, setNewAccount] = useState({ username: '', password: '', serverUrl: 'http://10.10.102.50:801' });

  const handleAddAccount = () => {
    if (!newAccount.username || !newAccount.password) return;
    const account: AccountConfig = {
      id: Date.now().toString(),
      name: newAccount.username,
      username: newAccount.username,
      password: newAccount.password,
      serverUrl: newAccount.serverUrl
    };
    
    setConfig({
      ...config,
      accounts: [...config.accounts, account],
      currentAccountId: config.currentAccountId || account.id
    });
    setNewAccount({ username: '', password: '', serverUrl: 'http://10.10.102.50:801' });
  };

  const toggleSetting = (key: string, value: boolean) => {
    setConfig({
        ...config,
        settings: { ...config.settings, [key]: value }
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>配置设置</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>常规设置</Text>
        <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>断线自动重连</Text>
            <Switch 
                trackColor={{ false: "rgba(0,0,0,0.1)", true: "#bae6fd" }}
                thumbColor={config.settings.autoReconnect ? theme.colors.primary : "#f4f3f4"}
                value={config.settings.autoReconnect} 
                onValueChange={(v) => toggleSetting('autoReconnect', v)} 
            />
        </View>
        <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>开机自动启动</Text>
            <Switch 
                trackColor={{ false: "rgba(0,0,0,0.1)", true: "#bae6fd" }}
                thumbColor={config.settings.autoLaunch ? theme.colors.primary : "#f4f3f4"}
                value={config.settings.autoLaunch} 
                onValueChange={(v) => toggleSetting('autoLaunch', v)} 
            />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>账号管理</Text>
        {config.accounts.map(acc => (
            <View key={acc.id} style={styles.accountItem}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.accountName}>{acc.username}</Text>
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

        <Text style={[styles.cardTitle, { marginTop: 32, fontSize: 16 }]}>添加新账号</Text>
        
        <View style={styles.inputGroup}>
            <Text style={styles.label}>用户名</Text>
            <TextInput 
                style={styles.input} 
                value={newAccount.username} 
                onChangeText={t => setNewAccount({...newAccount, username: t})}
                placeholder="请输入学号/用户名"
                placeholderTextColor="#94a3b8"
            />
        </View>

        <View style={styles.inputGroup}>
            <Text style={styles.label}>密码</Text>
            <TextInput 
                style={styles.input} 
                value={newAccount.password} 
                onChangeText={t => setNewAccount({...newAccount, password: t})}
                placeholder="请输入密码"
                placeholderTextColor="#94a3b8"
                secureTextEntry
            />
        </View>

        <View style={styles.inputGroup}>
            <Text style={styles.label}>服务器地址</Text>
            <TextInput 
                style={styles.input} 
                value={newAccount.serverUrl} 
                onChangeText={t => setNewAccount({...newAccount, serverUrl: t})}
                placeholder="http://..."
                placeholderTextColor="#94a3b8"
            />
        </View>

        <TouchableOpacity style={styles.btnAdd} onPress={handleAddAccount}>
            <Text style={styles.btnAddText}>保存并添加账号</Text>
        </TouchableOpacity>
      </View>
      
      <View style={[styles.card, { marginBottom: 40 }]}>
        <Text style={styles.cardTitle}>其他</Text>
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
    padding: theme.spacing.m,
    paddingTop: theme.spacing.xl,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: theme.spacing.l,
    color: '#0c4a6e',
  },
  card: {
    backgroundColor: theme.colors.cardBg,
    padding: theme.spacing.l,
    borderRadius: theme.roundness.l,
    marginBottom: theme.spacing.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: theme.spacing.m,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 4,
  },
  settingLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.text,
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
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
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    marginBottom: 10,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: theme.roundness.m,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    color: theme.colors.text,
  },
  btnAdd: {
    backgroundColor: theme.colors.primary,
    padding: 18,
    borderRadius: theme.roundness.m,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  btnAddText: { 
    color: '#fff', 
    fontWeight: '800',
    fontSize: 17 
  },
  smallBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
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
});