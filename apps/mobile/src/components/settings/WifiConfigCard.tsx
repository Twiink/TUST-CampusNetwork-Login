import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch } from 'react-native';
import type { AccountConfig, WifiConfig } from '@repo/shared';
import { GlassView } from '../GlassView';
import { useTheme } from '../../context/ThemeContext';
import { styles } from './settingsStyles';
import { getISPLabel, getPriorityColor, type NewWifiForm } from './shared';

/* eslint-disable react-native/no-inline-styles */

export const WifiConfigCard: React.FC<{
  wifiList: WifiConfig[];
  accounts: AccountConfig[];
  newWifi: NewWifiForm;
  setNewWifi: React.Dispatch<React.SetStateAction<NewWifiForm>>;
  onAddWifi: () => void;
  onRemoveWifi: (id: string) => void;
}> = ({ wifiList, accounts, newWifi, setNewWifi, onAddWifi, onRemoveWifi }) => {
  const { theme } = useTheme();
  return (
    <GlassView style={styles.card}>
      <Text style={[styles.cardHeader, { color: theme.colors.text }]}>WiFi 配置</Text>
      <Text style={[styles.settingDesc, { color: theme.colors.textSecondary, marginBottom: 16 }]}>
        配置需要自动连接的 WiFi 网络。启用心跳检测后，断线时会按优先级尝试切换网络。
      </Text>

      <View style={{ marginBottom: 20 }}>
        {wifiList.length === 0 ? (
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
          wifiList.map(wifi => {
            const linkedAccounts = accounts.filter(a => wifi.linkedAccountIds.includes(a.id));
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
                  onPress={() => onRemoveWifi(wifi.id)}
                >
                  <Text style={[styles.deleteBtnText, { color: theme.colors.danger }]}>删除</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>

      <Text style={[styles.subHeader, { color: theme.colors.text }]}>添加 WiFi</Text>

      <View style={styles.formGroup}>
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>WiFi 名称 (SSID)</Text>
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
          <Text style={[styles.settingLabel, { color: theme.colors.text }]}>需要校园网认证</Text>
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
          {accounts.length === 0 ? (
            <Text style={{ color: theme.colors.danger, fontSize: 14 }}>
              请先在上方「账号管理」添加账号
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {accounts.map(acc => (
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
        onPress={onAddWifi}
        disabled={(newWifi.requiresAuth && newWifi.linkedAccountIds.length === 0) || !newWifi.ssid}
        activeOpacity={0.8}
      >
        <Text style={styles.btnText}>添加 WiFi</Text>
      </TouchableOpacity>
    </GlassView>
  );
};
