import React, { useEffect, useState } from 'react';
import { Text, Pressable } from 'react-native';
import { retryWifiRecovery } from '../../native/AutoAuth';
import { openWifiSettings } from '../../native/WifiModule';
import { GlassView } from '../GlassView';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';

const cardStyle = { padding: 16, marginVertical: 12 };
const buttonStyle = { paddingVertical: 12 };
export function AutoAuthStatus() {
  const { config, reconnectProgress: progress, resumeAutoAuth, authSnapshot } = useApp();
  const { theme } = useTheme();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!progress?.nextRetryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [progress?.nextRetryAt]);
  return (
    <>
      {authSnapshot?.wifiConnected && (
        <Text style={{ color: theme.colors.textSecondary }}>
          WiFi 已关联 ·{' '}
          {authSnapshot.requiresAuth
            ? authSnapshot.authenticated
              ? '已认证'
              : '未认证'
            : '无需认证'}{' '}
          · {authSnapshot.internetReachable ? '互联网可达' : '互联网不可达'}
        </Text>
      )}
      {config.settings.autoAuthPaused && (
        <GlassView style={cardStyle}>
          <Text style={{ color: theme.colors.text }}>自动认证已暂停</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="恢复自动认证"
            onPress={() => {
              resumeAutoAuth().catch(() => undefined);
            }}
          >
            <Text style={[buttonStyle, { color: theme.colors.primary }]}>恢复自动认证</Text>
          </Pressable>
        </GlassView>
      )}
      {progress && progress.status !== 'idle' && (
        <GlassView style={cardStyle}>
          <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.text }}>
            {progress.status === 'cooldown'
              ? '等待下一轮重连'
              : progress.status === 'awaiting-system'
                ? '请在系统 WiFi 中确认连接'
                : progress.status === 'authenticating'
                  ? '正在认证'
                  : progress.status === 'verifying'
                    ? '正在确认联网'
                    : progress.status === 'cancelled'
                      ? '恢复已停止'
                      : progress.status === 'connecting'
                        ? '正在连接 WiFi'
                        : progress.status === 'success'
                          ? '网络已恢复'
                          : 'WiFi 连接失败'}
          </Text>
          <Text style={{ color: theme.colors.textSecondary }}>
            {progress.ssid} {progress.attempt ? `${progress.attempt}/${progress.maxAttempts}` : ''}
          </Text>
          {!!(progress.reason || progress.message) && (
            <Text style={{ color: theme.colors.textSecondary }}>
              {progress.reason ?? progress.message}
            </Text>
          )}
          {['failed', 'cooldown', 'cancelled'].includes(progress.status) && (
            <Pressable accessibilityRole="button" onPress={() => retryWifiRecovery()}>
              <Text style={[buttonStyle, { color: theme.colors.primary }]}>立即重试</Text>
            </Pressable>
          )}
          {['awaiting-system', 'failed', 'cooldown'].includes(progress.status) && (
            <Pressable accessibilityRole="button" onPress={() => openWifiSettings()}>
              <Text style={[buttonStyle, { color: theme.colors.primary }]}>打开系统 WiFi</Text>
            </Pressable>
          )}
          {progress.nextRetryAt ? (
            <Text style={{ color: theme.colors.textSecondary }}>
              剩余 {Math.max(0, Math.ceil((progress.nextRetryAt - now) / 1000))} 秒
            </Text>
          ) : null}
          {progress.failedList?.map(item => (
            <Text key={item.wifiId ?? item.ssid} style={{ color: theme.colors.danger }}>
              {item.ssid}：{item.reason}
            </Text>
          ))}
        </GlassView>
      )}
    </>
  );
}
