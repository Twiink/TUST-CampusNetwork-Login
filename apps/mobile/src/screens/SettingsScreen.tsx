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
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>General</Text>
        <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Auto Reconnect</Text>
            <Switch 
                trackColor={{ false: "#e2e8f0", true: "#bae6fd" }}
                thumbColor={config.settings.autoReconnect ? theme.colors.primary : "#f4f3f4"}
                ios_backgroundColor="#3e3e3e"
                value={config.settings.autoReconnect} 
                onValueChange={(v) => toggleSetting('autoReconnect', v)} 
            />
        </View>
        <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Auto Launch</Text>
            <Switch 
                trackColor={{ false: "#e2e8f0", true: "#bae6fd" }}
                thumbColor={config.settings.autoLaunch ? theme.colors.primary : "#f4f3f4"}
                value={config.settings.autoLaunch} 
                onValueChange={(v) => toggleSetting('autoLaunch', v)} 
            />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Accounts</Text>
        {config.accounts.map(acc => (
            <View key={acc.id} style={styles.accountItem}>
                <View>
                    <Text style={styles.accountName}>{acc.username}</Text>
                    <Text style={styles.accountUrl}>{acc.serverUrl}</Text>
                </View>
                <TouchableOpacity 
                    style={[styles.smallBtn, config.currentAccountId === acc.id ? styles.btnDisabled : styles.btnPrimary]}
                    onPress={() => setConfig({ ...config, currentAccountId: acc.id })}
                    disabled={config.currentAccountId === acc.id}
                >
                    <Text style={styles.smallBtnText}>{config.currentAccountId === acc.id ? 'Active' : 'Select'}</Text>
                </TouchableOpacity>
            </View>
        ))}

        <Text style={[styles.cardTitle, { marginTop: 24, fontSize: 15 }]}>Add Account</Text>
        
        <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput 
                style={styles.input} 
                value={newAccount.username} 
                onChangeText={t => setNewAccount({...newAccount, username: t})}
                placeholder="Enter username"
                placeholderTextColor="#94a3b8"
            />
        </View>

        <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput 
                style={styles.input} 
                value={newAccount.password} 
                onChangeText={t => setNewAccount({...newAccount, password: t})}
                placeholder="Enter password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
            />
        </View>

        <View style={styles.inputGroup}>
            <Text style={styles.label}>Server URL</Text>
            <TextInput 
                style={styles.input} 
                value={newAccount.serverUrl} 
                onChangeText={t => setNewAccount({...newAccount, serverUrl: t})}
                placeholder="http://..."
                placeholderTextColor="#94a3b8"
            />
        </View>

        <TouchableOpacity style={styles.btnAdd} onPress={handleAddAccount}>
            <Text style={styles.btnAddText}>Add Account</Text>
        </TouchableOpacity>
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
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: theme.spacing.l,
    color: '#0f172a',
    marginTop: theme.spacing.s,
  },
  card: {
    backgroundColor: theme.colors.cardBg,
    padding: theme.spacing.l,
    borderRadius: theme.roundness.l,
    marginBottom: theme.spacing.m,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: theme.spacing.m,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 4,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  accountName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  accountUrl: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.m,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    fontSize: 15,
    color: theme.colors.text,
  },
  btnAdd: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: theme.roundness.pill,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  btnAddText: { 
    color: '#fff', 
    fontWeight: '700',
    fontSize: 16 
  },
  smallBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.roundness.pill,
  },
  btnPrimary: {
    backgroundColor: '#e0f2fe',
  },
  btnDisabled: {
    backgroundColor: '#f1f5f9',
  },
  smallBtnText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});