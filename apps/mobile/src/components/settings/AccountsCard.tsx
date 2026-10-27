import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Keyboard } from 'react-native';
import type { AccountConfig } from '@repo/shared';
import { GlassView } from '../GlassView';
import { useTheme } from '../../context/ThemeContext';
import { styles } from './settingsStyles';
import { ISP_OPTIONS, getISPLabel, type NewAccountForm } from './shared';

/* eslint-disable react-native/no-inline-styles */

export const AccountsCard: React.FC<{
  accounts: AccountConfig[];
  currentAccountId: string | null;
  newAccount: NewAccountForm;
  setNewAccount: React.Dispatch<React.SetStateAction<NewAccountForm>>;
  error?: string | null;
  onAddAccount: () => void;
  onEditAccount?: (id: string) => void;
  onRemoveAccount: (id: string) => void;
  onSwitchAccount: (id: string) => void;
}> = ({
  accounts,
  currentAccountId,
  newAccount,
  setNewAccount,
  error,
  onAddAccount,
  onEditAccount,
  onRemoveAccount,
  onSwitchAccount,
}) => {
  const { theme } = useTheme();
  return (
    <GlassView style={styles.card}>
      <Text style={[styles.cardHeader, { color: theme.colors.text }]}>账号管理</Text>

      <View style={{ marginBottom: 20 }}>
        {accounts.map(acc => (
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
                  currentAccountId === acc.id
                    ? { backgroundColor: theme.colors.border }
                    : { backgroundColor: theme.colors.primary },
                ]}
                onPress={() => onSwitchAccount(acc.id)}
                disabled={currentAccountId === acc.id}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`使用账号 ${acc.username}`}
              >
                <Text
                  style={[
                    styles.smallBtnText,
                    {
                      color: currentAccountId === acc.id ? theme.colors.textSecondary : '#fff',
                    },
                  ]}
                >
                  {currentAccountId === acc.id ? '使用中' : '使用'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.smallBtn}
                accessibilityRole="button"
                accessibilityLabel={`编辑账号 ${acc.username}`}
                onPress={() => onEditAccount?.(acc.id)}
              >
                <Text style={{ color: theme.colors.text }}>编辑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteBtn, { backgroundColor: theme.colors.danger + '20' }]}
                onPress={() => onRemoveAccount(acc.id)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`删除账号 ${acc.username}`}
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
          testID="add-username"
          accessibilityLabel="add-username"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
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
          testID="add-account-password"
          accessibilityLabel="add-account-password"
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
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
          testID="add-server"
          accessibilityLabel="add-server"
          value={newAccount.serverUrl}
          onChangeText={t => setNewAccount({ ...newAccount, serverUrl: t })}
          placeholder="http://..."
          placeholderTextColor={theme.colors.textSecondary}
        />
      </View>

      {error && (
        <Text
          accessibilityRole="alert"
          style={{ color: theme.colors.danger, fontSize: 13, marginBottom: 12 }}
        >
          {error}
        </Text>
      )}
      <TouchableOpacity
        testID="add-account"
        style={[
          styles.btnPrimary,
          {
            backgroundColor: theme.colors.primary,
            shadowColor: theme.colors.primary,
          },
        ]}
        onPress={onAddAccount}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="保存并添加账号"
      >
        <Text style={styles.btnText}>保存并添加账号</Text>
      </TouchableOpacity>
    </GlassView>
  );
};
