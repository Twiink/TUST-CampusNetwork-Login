import React from 'react';
import { View, Text, TextInput, Switch } from 'react-native';
import type { AppSettings } from '@repo/shared';
import { GlassView } from '../GlassView';
import { useTheme } from '../../context/ThemeContext';
import { styles } from './settingsStyles';

/* eslint-disable react-native/no-inline-styles */
// Inline styles are necessary for dynamic theming based on theme context

export const GeneralSettingsCard: React.FC<{
  settings: AppSettings;
  onToggleSetting: (key: string, value: boolean | number) => void;
  onToggleNotificationSetting: (
    key: keyof AppSettings['notificationSettings'],
    value: boolean
  ) => void;
}> = ({ settings, onToggleSetting, onToggleNotificationSetting }) => {
  const { theme } = useTheme();
  return (
    <>
      <GlassView style={styles.card}>
        <Text style={[styles.cardHeader, { color: theme.colors.text }]}>通用设置</Text>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: theme.colors.text }]}>开机自动启动</Text>
          <Switch
            trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
            thumbColor={settings.autoLaunch ? theme.colors.primary : '#f4f3f4'}
            value={settings.autoLaunch}
            onValueChange={v => onToggleSetting('autoLaunch', v)}
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
            thumbColor={settings.enableHeartbeat ? theme.colors.primary : '#f4f3f4'}
            value={settings.enableHeartbeat}
            onValueChange={v => onToggleSetting('enableHeartbeat', v)}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>断线自动重连</Text>
            <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
              校园网认证失效时自动登录；WiFi 断开时按优先级重连已开启自动连接的 WiFi
            </Text>
          </View>
          <Switch
            trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
            thumbColor={settings.autoReconnect ? theme.colors.primary : '#f4f3f4'}
            value={settings.autoReconnect}
            onValueChange={v => onToggleSetting('autoReconnect', v)}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>启动时自动连接</Text>
            <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
              后台服务启动时若未连接 WiFi，按优先级连接已配置的 WiFi
            </Text>
          </View>
          <Switch
            trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
            thumbColor={settings.startupAutoConnect ? theme.colors.primary : '#f4f3f4'}
            value={settings.startupAutoConnect}
            onValueChange={v => onToggleSetting('startupAutoConnect', v)}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>保持当前连接</Text>
            <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
              启动时已连接其他 WiFi 则不切换；关闭后会建议切换到最高优先级的已配置 WiFi
            </Text>
          </View>
          <Switch
            trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
            thumbColor={settings.keepCurrentConnection ? theme.colors.primary : '#f4f3f4'}
            value={settings.keepCurrentConnection}
            onValueChange={v => onToggleSetting('keepCurrentConnection', v)}
          />
        </View>

        <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingLabel, { color: theme.colors.text }]}>自动检查更新</Text>
            <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
              启动时检查 GitHub 新版本（12 小时内只检查一次）
            </Text>
          </View>
          <Switch
            trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
            thumbColor={settings.autoUpdate ? theme.colors.primary : '#f4f3f4'}
            value={settings.autoUpdate}
            onValueChange={v => onToggleSetting('autoUpdate', v)}
          />
        </View>

        {settings.enableHeartbeat && (
          <>
            <View style={[styles.divider, { backgroundColor: theme.colors.border + '30' }]} />

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: theme.colors.text }]}>
                  心跳检测间隔
                </Text>
                <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                  当前值: {settings.heartbeatIntervalSeconds} 秒
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
                value={String(settings.heartbeatIntervalSeconds)}
                onChangeText={text => {
                  const value = parseInt(text, 10) || 5;
                  if (value >= 5 && value <= 300) {
                    onToggleSetting('heartbeatIntervalSeconds', value);
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
                  当前值: {settings.heartbeatFailureThreshold} 次
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
                value={String(settings.heartbeatFailureThreshold)}
                onChangeText={text => {
                  const value = parseInt(text, 10) || 1;
                  if (value >= 1 && value <= 10) {
                    onToggleSetting('heartbeatFailureThreshold', value);
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
                  当前值: {settings.wifiReconnectRetries} 次
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
                value={String(settings.wifiReconnectRetries)}
                onChangeText={text => {
                  const value = parseInt(text, 10) || 0;
                  if (value >= 0 && value <= 10) {
                    onToggleSetting('wifiReconnectRetries', value);
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
                <Text style={[styles.settingLabel, { color: theme.colors.text }]}>冷却期时长</Text>
                <Text style={[styles.settingDesc, { color: theme.colors.textSecondary }]}>
                  当前值: {settings.wifiReconnectCooldownMinutes} 分钟
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
                value={String(settings.wifiReconnectCooldownMinutes)}
                onChangeText={text => {
                  const value = parseInt(text, 10) || 0;
                  if (value >= 0 && value <= 60) {
                    onToggleSetting('wifiReconnectCooldownMinutes', value);
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
              settings.notificationSettings.wifiDisconnected ? theme.colors.primary : '#f4f3f4'
            }
            value={settings.notificationSettings.wifiDisconnected}
            onValueChange={v => onToggleNotificationSetting('wifiDisconnected', v)}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: theme.colors.text }]}>自动重连成功</Text>
          <Switch
            trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
            thumbColor={
              settings.notificationSettings.reconnectSuccess ? theme.colors.primary : '#f4f3f4'
            }
            value={settings.notificationSettings.reconnectSuccess}
            onValueChange={v => onToggleNotificationSetting('reconnectSuccess', v)}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: theme.colors.text }]}>自动重连全部失败</Text>
          <Switch
            trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
            thumbColor={
              settings.notificationSettings.reconnectFailed ? theme.colors.primary : '#f4f3f4'
            }
            value={settings.notificationSettings.reconnectFailed}
            onValueChange={v => onToggleNotificationSetting('reconnectFailed', v)}
          />
        </View>

        <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
          <Text style={[styles.settingLabel, { color: theme.colors.text }]}>认证恢复成功</Text>
          <Switch
            trackColor={{ false: theme.colors.border, true: theme.colors.primary + '40' }}
            thumbColor={
              settings.notificationSettings.authRecovered ? theme.colors.primary : '#f4f3f4'
            }
            value={settings.notificationSettings.authRecovered}
            onValueChange={v => onToggleNotificationSetting('authRecovered', v)}
          />
        </View>
      </GlassView>
    </>
  );
};
