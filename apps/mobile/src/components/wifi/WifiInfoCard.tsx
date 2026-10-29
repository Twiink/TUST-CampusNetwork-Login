import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import type * as WifiModule from '../../native/WifiModule';

/* eslint-disable react-native/no-inline-styles */
// Inline styles are necessary for dynamic theming based on theme context

const getSignalIcon = (strength: number, dark: boolean) => {
  if (strength >= 75)
    return {
      emoji: '📶',
      color: dark ? '#34d399' : '#22c55e',
      text: '优秀',
    };
  if (strength >= 50)
    return {
      emoji: '📶',
      color: dark ? '#60a5fa' : '#3b82f6',
      text: '良好',
    };
  if (strength >= 25)
    return {
      emoji: '📶',
      color: dark ? '#fbbf24' : '#f59e0b',
      text: '一般',
    };
  return {
    emoji: '📶',
    color: dark ? '#f87171' : '#ef4444',
    text: '较差',
  };
};

// 连接速度等级和颜色（支持深色模式）
const getLinkSpeedStatus = (speed: number, dark: boolean) => {
  if (speed >= 500) return { color: dark ? '#34d399' : '#22c55e', text: '优秀' };
  if (speed >= 200) return { color: dark ? '#60a5fa' : '#3b82f6', text: '良好' };
  if (speed >= 100) return { color: dark ? '#fbbf24' : '#f59e0b', text: '一般' };
  if (speed >= 50) return { color: dark ? '#fb923c' : '#f97316', text: '较差' };
  return { color: dark ? '#f87171' : '#ef4444', text: '很差' };
};
export const WifiInfoCard: React.FC<{
  wifiInfo: WifiModule.NetworkInfo | null;
  theme: any;
  onRefresh: () => void;
  refreshing: boolean;
}> = React.memo(({ wifiInfo, theme, onRefresh, refreshing }) => {
  const { themeMode } = useTheme();
  const isDark = themeMode === 'dark';

  const signalStrength = wifiInfo?.signalStrength || 0;
  const linkSpeed = wifiInfo?.linkSpeed || 0;
  const frequency = wifiInfo?.frequency || 0;

  const signal = getSignalIcon(signalStrength, isDark);
  const linkSpeedStatus = getLinkSpeedStatus(linkSpeed, isDark);

  return (
    <View
      style={{
        backgroundColor: theme.colors.primary + '10',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
      }}
    >
      {/* WiFi 名称和刷新按钮 */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 16,
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Text style={{ fontSize: 18, marginRight: 8 }}>📡</Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 14, marginRight: 8 }}>
            WiFi 名称:
          </Text>
          <Text
            style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700', flex: 1 }}
            numberOfLines={1}
          >
            {wifiInfo?.ssid || '未知'}
          </Text>
        </View>

        {/* 刷新按钮 */}
        <TouchableOpacity
          onPress={onRefresh}
          disabled={refreshing}
          style={{
            padding: 8,
            borderRadius: 20,
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            opacity: refreshing ? 0.5 : 1,
          }}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 18, transform: [{ rotate: refreshing ? '360deg' : '0deg' }] }}>
            🔄
          </Text>
        </TouchableOpacity>
      </View>

      {/* 网络指标 */}
      <View style={{ gap: 12 }}>
        {/* 信号强度 */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
            borderRadius: 12,
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 20, marginRight: 12 }}>{signal.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>信号强度</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: signal.color }}>
              {signalStrength}% · {signal.text}
            </Text>
          </View>
        </View>

        {/* 连接速度和频段 */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.5)',
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text style={{ fontSize: 20, marginRight: 8 }}>🚀</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>连接速度</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: linkSpeedStatus.color }}>
                {linkSpeed > 0 ? `${linkSpeed} Mbps · ${linkSpeedStatus.text}` : '未知'}
              </Text>
            </View>
          </View>

          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.5)',
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text style={{ fontSize: 20, marginRight: 8 }}>📻</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>频段</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }}>
                {frequency >= 5925 && frequency <= 7125
                  ? '6GHz'
                  : frequency >= 4900 && frequency < 5925
                    ? '5GHz'
                    : frequency >= 2400 && frequency <= 2500
                      ? '2.4GHz'
                      : '未知'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* 扩展信息（如果有） */}
      {(wifiInfo?.ipv4 || wifiInfo?.mac || wifiInfo?.bssid || wifiInfo?.security) && (
        <View
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: 'rgba(0, 0, 0, 0.1)',
          }}
        >
          <View style={{ gap: 8 }}>
            {wifiInfo?.ipv4 && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary, width: 80 }}>
                  IPv4:
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.text,
                    fontFamily: 'monospace',
                    flex: 1,
                  }}
                >
                  {wifiInfo.ipv4}
                </Text>
              </View>
            )}
            {wifiInfo?.ipv6 && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary, width: 80 }}>
                  IPv6:
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: theme.colors.text,
                    fontFamily: 'monospace',
                    flex: 1,
                  }}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {wifiInfo.ipv6}
                </Text>
              </View>
            )}
            {wifiInfo?.mac && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary, width: 80 }}>
                  MAC:
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.text,
                    fontFamily: 'monospace',
                    flex: 1,
                  }}
                >
                  {wifiInfo.mac}
                </Text>
              </View>
            )}
            {wifiInfo?.gateway && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary, width: 80 }}>
                  网关:
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.text,
                    fontFamily: 'monospace',
                    flex: 1,
                  }}
                >
                  {wifiInfo.gateway}
                </Text>
              </View>
            )}
            {wifiInfo?.dns && wifiInfo.dns.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary, width: 80 }}>
                  DNS:
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.text,
                    fontFamily: 'monospace',
                    flex: 1,
                  }}
                >
                  {wifiInfo.dns[0]}
                </Text>
              </View>
            )}
            {wifiInfo?.bssid && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary, width: 80 }}>
                  BSSID:
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.text,
                    fontFamily: 'monospace',
                    flex: 1,
                  }}
                >
                  {wifiInfo.bssid}
                </Text>
              </View>
            )}
            {wifiInfo?.channel && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary, width: 80 }}>
                  信道:
                </Text>
                <Text style={{ fontSize: 12, color: theme.colors.text, flex: 1 }}>
                  {wifiInfo.channel}
                </Text>
              </View>
            )}
            {wifiInfo?.security && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: theme.colors.textSecondary, width: 80 }}>
                  安全类型:
                </Text>
                <Text style={{ fontSize: 12, color: theme.colors.text, flex: 1 }}>
                  {wifiInfo.security}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
});
