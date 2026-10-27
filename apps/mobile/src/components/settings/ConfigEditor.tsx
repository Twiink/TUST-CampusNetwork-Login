import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import {
  editAccount,
  editWifi,
  moveLinkedAccount,
  type AppConfig,
  type AccountConfig,
  type WifiConfig,
} from '@repo/shared';
import { useTheme } from '../../context/ThemeContext';
import { ISP_OPTIONS } from './shared';
export type EditingTarget = { kind: 'account' | 'wifi'; id: string };
export function ConfigEditor({
  config,
  target,
  onSave,
  onClose,
}: {
  config: AppConfig;
  target: EditingTarget;
  onSave: (update: (current: AppConfig) => AppConfig) => Promise<void>;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          justifyContent: 'center',
          padding: 20,
          backgroundColor: 'rgba(0,0,0,0.45)',
        },
        panel: {
          maxHeight: '90%',
          borderRadius: 16,
          padding: 20,
          backgroundColor: theme.colors.bg,
        },
        title: { color: theme.colors.text, fontSize: 22, fontWeight: '700', marginBottom: 16 },
        label: { color: theme.colors.text, marginTop: 16, marginBottom: 8 },
        input: {
          color: theme.colors.text,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: 8,
          padding: 12,
          minHeight: 48,
        },
        row: {
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 12,
        },
        button: {
          padding: 12,
          minHeight: 48,
          borderRadius: 8,
          backgroundColor: theme.colors.primary,
        },
        buttonText: { color: '#fff', fontWeight: '600' },
        text: { color: theme.colors.text, flexShrink: 1 },
        error: { color: theme.colors.danger, marginTop: 12 },
      }),
    [theme]
  );
  const [account, setAccount] = useState(() => ({
    ...config.accounts.find(a => a.id === target.id)!,
  }));
  const [wifi, setWifi] = useState(() => {
    const value = config.wifiList.find(w => w.id === target.id);
    return { ...value!, linkedAccountIds: [...(value?.linkedAccountIds ?? [])] };
  });
  const [password, setPassword] = useState(''),
    [clearPassword, setClearPassword] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(current =>
        target.kind === 'account'
          ? editAccount(current, target.id, account as AccountConfig, password)
          : editWifi(current, target.id, wifi as WifiConfig, password, clearPassword)
      );
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!saving) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.panel} accessibilityViewIsModal testID="config-editor">
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{target.kind === 'account' ? '编辑账号' : '编辑 WiFi'}</Text>
            {target.kind === 'account' ? (
              <>
                <Text style={styles.label}>用户名</Text>
                <TextInput
                  accessibilityLabel="编辑用户名"
                  testID="edit-username"
                  style={styles.input}
                  autoCapitalize="none"
                  value={account.username}
                  onChangeText={username => setAccount(previous => ({ ...previous, username }))}
                />
                <Text style={styles.label}>服务器地址</Text>
                <TextInput
                  accessibilityLabel="编辑服务器地址"
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="url"
                  value={account.serverUrl}
                  onChangeText={serverUrl => setAccount(previous => ({ ...previous, serverUrl }))}
                />
                <Text style={styles.label}>运营商</Text>
                {ISP_OPTIONS.map(option => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: account.isp === option.value }}
                    accessibilityLabel={`运营商 ${option.label}`}
                    style={styles.row}
                    onPress={() => setAccount(previous => ({ ...previous, isp: option.value }))}
                  >
                    <Text style={styles.text}>
                      {option.label}
                      {account.isp === option.value ? ' · 已选择' : ''}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <>
                <Text style={styles.label}>WiFi 名称</Text>
                <TextInput
                  accessibilityLabel="编辑 WiFi 名称"
                  style={styles.input}
                  value={wifi.ssid}
                  onChangeText={ssid => setWifi(previous => ({ ...previous, ssid }))}
                />
                <Text style={styles.label}>优先级</Text>
                <TextInput
                  accessibilityLabel="编辑优先级"
                  style={styles.input}
                  keyboardType="number-pad"
                  value={String(wifi.priority)}
                  onChangeText={priority =>
                    setWifi(previous => ({ ...previous, priority: Number(priority) }))
                  }
                />
                <View style={styles.row}>
                  <Text style={styles.text}>自动连接此 WiFi</Text>
                  <Switch
                    accessibilityLabel="编辑自动连接"
                    value={wifi.autoConnect}
                    onValueChange={autoConnect =>
                      setWifi(previous => ({ ...previous, autoConnect }))
                    }
                  />
                </View>
                <View style={styles.row}>
                  <Text style={styles.text}>需要校园网认证</Text>
                  <Switch
                    accessibilityLabel="编辑认证要求"
                    value={wifi.requiresAuth}
                    onValueChange={requiresAuth =>
                      setWifi(previous => ({ ...previous, requiresAuth }))
                    }
                  />
                </View>
                {wifi.requiresAuth ? (
                  <>
                    <Text style={styles.label}>关联账号（按顺序尝试）</Text>
                    {config.accounts.map(item => (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: wifi.linkedAccountIds.includes(item.id) }}
                        key={item.id}
                        style={styles.row}
                        onPress={() =>
                          setWifi(previous => ({
                            ...previous,
                            linkedAccountIds: previous.linkedAccountIds.includes(item.id)
                              ? previous.linkedAccountIds.filter(id => id !== item.id)
                              : [...previous.linkedAccountIds, item.id],
                          }))
                        }
                      >
                        <Text style={styles.text}>
                          {item.username}
                          {wifi.linkedAccountIds.includes(item.id) ? ' · 已关联' : ''}
                        </Text>
                      </Pressable>
                    ))}
                    {wifi.linkedAccountIds.map((id, index) => (
                      <View key={id} style={styles.row}>
                        <Text style={styles.text}>
                          {index + 1}. {config.accounts.find(item => item.id === id)?.username}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`上移账号 ${index + 1}`}
                          disabled={index === 0}
                          onPress={() =>
                            setWifi(previous => ({
                              ...previous,
                              linkedAccountIds: moveLinkedAccount(
                                previous.linkedAccountIds,
                                id,
                                -1
                              ),
                            }))
                          }
                        >
                          <Text style={styles.text}>上移</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`下移账号 ${index + 1}`}
                          disabled={index === wifi.linkedAccountIds.length - 1}
                          onPress={() =>
                            setWifi(previous => ({
                              ...previous,
                              linkedAccountIds: moveLinkedAccount(previous.linkedAccountIds, id, 1),
                            }))
                          }
                        >
                          <Text style={styles.text}>下移</Text>
                        </Pressable>
                      </View>
                    ))}
                  </>
                ) : null}
              </>
            )}
            <Text style={styles.label}>新密码（留空保留原密码）</Text>
            <TextInput
              accessibilityLabel="编辑新密码"
              testID="edit-password"
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              value={password}
              editable={!clearPassword && !saving}
              onChangeText={setPassword}
            />
            {target.kind === 'wifi' ? (
              <View style={styles.row}>
                <Text style={styles.text}>清除密码，使用开放网络</Text>
                <Switch
                  accessibilityLabel="清除 WiFi 密码"
                  value={clearPassword}
                  onValueChange={setClearPassword}
                />
              </View>
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <View style={styles.row}>
              <Pressable
                style={styles.button}
                accessibilityRole="button"
                disabled={saving}
                onPress={onClose}
              >
                <Text style={styles.buttonText}>取消</Text>
              </Pressable>
              <Pressable
                testID="save-edit"
                style={styles.button}
                accessibilityRole="button"
                disabled={saving}
                onPress={() => save()}
              >
                <Text style={styles.buttonText}>{saving ? '保存中…' : '保存修改'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
