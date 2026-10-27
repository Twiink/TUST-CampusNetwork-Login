/**
 * 主页卡片组件（自 HomeScreen 抽出）：
 * 提示卡（WiFi 未配置/无需认证/未配置账户共用）、网络状态卡、当前账号卡。
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { type AnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { GlassView } from '../GlassView';
import { styles } from './homeScreenStyles';

/* eslint-disable react-native/no-inline-styles */

interface ThemeColors {
  text: string;
  textSecondary: string;
  success: string;
  danger: string;
  warning: string;
  primary: string;
}

export interface HomeNoticeCardProps {
  icon: string;
  /** 标题与提示框着色（success/warning 等） */
  tint: string;
  title: string;
  description: string;
  hint: string;
  theme: { colors: ThemeColors };
}

/** 单卡提示：emoji 图标 + 标题 + 描述 + 着色提示框 */
export const HomeNoticeCard: React.FC<HomeNoticeCardProps> = React.memo(
  ({ icon, tint, title, description, hint, theme }) => {
    return (
      <GlassView style={styles.card}>
        <View style={styles.warningCardContent}>
          <Text style={styles.warningIcon}>{icon}</Text>
          <Text style={[styles.warningTitle, { color: tint }]}>{title}</Text>
          <Text style={[styles.warningText, { color: theme.colors.textSecondary }]}>
            {description}
          </Text>
          <View
            style={[
              styles.warningBox,
              {
                backgroundColor: tint + '20',
                borderColor: tint + '40',
              },
            ]}
          >
            <Text style={[styles.warningBoxText, { color: theme.colors.textSecondary }]}>
              {hint}
            </Text>
          </View>
        </View>
      </GlassView>
    );
  }
);

export interface NetworkStatusCardProps {
  networkStatus: 'connected' | 'disconnected' | 'connecting';
  statusText: string;
  ipAddress: string | null;
  onLogin: () => void;
  onLogout: () => void;
  theme: { colors: ThemeColors };
  badgeStyle: AnimatedStyle;
  pulseOpacity: SharedValue<number>;
}

/** 网络状态卡：状态徽标 + IP + 登录/登出按钮 */
export const NetworkStatusCard: React.FC<NetworkStatusCardProps> = React.memo(
  ({
    networkStatus,
    statusText,
    ipAddress,
    onLogin,
    onLogout,
    theme,
    badgeStyle,
    pulseOpacity,
  }) => {
    return (
      <GlassView style={styles.card}>
        <Text style={[styles.cardHeader, { color: theme.colors.text }]}>网络状态</Text>

        <View style={styles.statusContainer}>
          <Animated.View
            style={[
              styles.badge,
              badgeStyle,
              { opacity: pulseOpacity },
              networkStatus === 'connected'
                ? {
                    borderColor: theme.colors.success,
                    backgroundColor: `${theme.colors.success}20`,
                  }
                : networkStatus === 'disconnected'
                  ? {
                      borderColor: theme.colors.danger,
                      backgroundColor: `${theme.colors.danger}20`,
                    }
                  : {
                      borderColor: theme.colors.warning,
                      backgroundColor: `${theme.colors.warning}20`,
                    },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                {
                  color:
                    networkStatus === 'connected'
                      ? theme.colors.success
                      : networkStatus === 'disconnected'
                        ? theme.colors.danger
                        : theme.colors.warning,
                },
              ]}
            >
              {statusText}
            </Text>
          </Animated.View>
        </View>

        {networkStatus === 'connected' && (
          <Text style={[styles.ipText, { color: theme.colors.text }]}>IP: {ipAddress}</Text>
        )}

        <TouchableOpacity
          style={[
            styles.btn,
            {
              backgroundColor:
                networkStatus === 'connected' ? theme.colors.danger : theme.colors.primary,
              shadowColor:
                networkStatus === 'connected' ? theme.colors.danger : theme.colors.primary,
            },
          ]}
          onPress={networkStatus === 'connected' ? onLogout : onLogin}
          disabled={networkStatus === 'connecting'}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={
            networkStatus === 'connected'
              ? '断开连接'
              : networkStatus === 'connecting'
                ? '正在连接...'
                : '立即连接'
          }
        >
          <Text style={styles.btnText}>
            {networkStatus === 'connected'
              ? '断开连接'
              : networkStatus === 'connecting'
                ? '正在连接...'
                : '立即连接'}
          </Text>
        </TouchableOpacity>
      </GlassView>
    );
  }
);

export interface CurrentAccountCardProps {
  username: string;
  serverUrl: string;
  theme: { colors: ThemeColors };
}

/** 当前账号卡：用户名 + 服务器 */
export const CurrentAccountCard: React.FC<CurrentAccountCardProps> = React.memo(
  ({ username, serverUrl, theme }) => {
    return (
      <GlassView style={styles.card}>
        <Text style={[styles.cardHeader, { color: theme.colors.text }]}>当前账号</Text>

        <View style={styles.accountInfoContainer}>
          <View style={styles.infoRow}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>用户名</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>{username}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={[styles.label, { color: theme.colors.textSecondary }]}>服务器</Text>
            <Text style={[styles.value, { color: theme.colors.text }]}>{serverUrl}</Text>
          </View>
        </View>
      </GlassView>
    );
  }
);
