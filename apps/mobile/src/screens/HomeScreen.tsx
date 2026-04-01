import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { GlassView } from '../components/GlassView';
import * as WifiModule from '../native/WifiModule';

/* eslint-disable react-native/no-inline-styles */
// Inline styles are necessary in this file for dynamic theming based on theme context

// WiFi 信号强度图标和颜色（支持深色模式）
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

// WiFi 信息卡片组件
const WifiInfoCard: React.FC<{
  wifiInfo: WifiModule.NetworkInfo | null;
  theme: any;
  onRefresh: () => void;
  refreshing: boolean;
}> = ({ wifiInfo, theme, onRefresh, refreshing }) => {
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
                {linkSpeed} Mbps · {linkSpeedStatus.text}
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
                {frequency >= 5000 ? '5GHz' : frequency >= 2400 ? '2.4GHz' : '未知'}
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
};

export const HomeScreen: React.FC = () => {
  const { networkStatus, ipAddress, login, logout, config } = useApp();
  const { theme } = useTheme();
  const [wifiInfo, setWifiInfo] = useState<WifiModule.NetworkInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);

  // Pulse animation for status badge
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);

  // 获取当前 WiFi 连接状态和详细信息
  const wifiConnected = wifiInfo?.connected ?? false;
  const wifiSSID = wifiInfo?.ssid || '';

  // 加载WiFi信息
  const loadWifiInfo = async () => {
    try {
      const info = await WifiModule.getNetworkInfo();
      setWifiInfo(info);
    } catch (error) {
      console.error('Failed to load WiFi info:', error);
    }
  };

  // 手动刷新WiFi信息
  const handleRefresh = async () => {
    const now = Date.now();
    // 防抖：2秒内不允许重复刷新
    if (now - lastRefreshTime < 2000) {
      return;
    }

    setRefreshing(true);
    setLastRefreshTime(now);

    try {
      await loadWifiInfo();
    } catch (error) {
      console.error('Failed to refresh WiFi info:', error);
    } finally {
      // 确保至少显示1秒的加载动画
      setTimeout(() => {
        setRefreshing(false);
      }, 1000);
    }
  };

  useEffect(() => {
    loadWifiInfo();

    // 定时刷新WiFi信息
    const interval = setInterval(loadWifiInfo, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (networkStatus === 'connecting') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      pulseOpacity.value = withRepeat(
        withSequence(withTiming(0.6, { duration: 800 }), withTiming(1, { duration: 800 })),
        -1,
        false
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      pulseOpacity.value = withTiming(1, { duration: 300 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkStatus]);

  const animatedBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
        return '已连接';
      case 'disconnected':
        return '未连接';
      case 'connecting':
        return '连接中...';
      default:
        return status;
    }
  };

  // 第一优先级：检查 WiFi 连接状态（无论是否配置账户）
  if (!wifiConnected) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.pageTitle, { color: theme.colors.text }]}>运行状态</Text>

          <GlassView style={styles.card}>
            <View style={styles.warningCardContent}>
              <Text style={styles.warningIcon}>📡</Text>
              <Text style={[styles.warningTitle, { color: theme.colors.danger }]}>未连接 WiFi</Text>
              <Text style={[styles.warningText, { color: theme.colors.textSecondary }]}>
                当前设备未连接到任何 WiFi 网络，请先连接 WiFi。
              </Text>
              <View
                style={[
                  styles.warningBox,
                  {
                    backgroundColor: theme.colors.danger + '20',
                    borderColor: theme.colors.danger + '40',
                  },
                ]}
              >
                <Text style={[styles.warningBoxText, { color: theme.colors.textSecondary }]}>
                  ⚠️ 连接到 WiFi 后才能使用网络认证功能
                </Text>
              </View>
            </View>
          </GlassView>
        </ScrollView>
      </View>
    );
  }

  // 第二优先级：检查 WiFi 是否在配置列表中
  const wifiConfig = config.wifiList?.find(w => w.ssid === wifiSSID);

  if (!wifiConfig) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.pageTitle, { color: theme.colors.text }]}>运行状态</Text>

          {/* WiFi 基础信息 - 必须显示 */}
          <GlassView style={styles.card}>
            <Text style={[styles.cardHeader, { color: theme.colors.text }]}>当前 WiFi</Text>
            <WifiInfoCard
              wifiInfo={wifiInfo}
              theme={theme}
              onRefresh={handleRefresh}
              refreshing={refreshing}
            />
          </GlassView>

          {/* WiFi 未配置警告 */}
          <GlassView style={styles.card}>
            <View style={styles.warningCardContent}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <Text style={[styles.warningTitle, { color: theme.colors.warning }]}>
                该 WiFi 未配置
              </Text>
              <Text style={[styles.warningText, { color: theme.colors.textSecondary }]}>
                当前连接的 WiFi "{wifiSSID}" 尚未配置，请前往"配置设置"添加此 WiFi 的配置。
              </Text>
              <View
                style={[
                  styles.warningBox,
                  {
                    backgroundColor: theme.colors.warning + '20',
                    borderColor: theme.colors.warning + '40',
                  },
                ]}
              >
                <Text style={[styles.warningBoxText, { color: theme.colors.textSecondary }]}>
                  ⚙️ 点击底部菜单的"配置设置"添加 WiFi 配置
                </Text>
              </View>
            </View>
          </GlassView>
        </ScrollView>
      </View>
    );
  }

  // 第三优先级：检查是否需要认证
  if (!wifiConfig.requiresAuth) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.pageTitle, { color: theme.colors.text }]}>运行状态</Text>

          {/* WiFi 基础信息 */}
          <GlassView style={styles.card}>
            <Text style={[styles.cardHeader, { color: theme.colors.text }]}>当前 WiFi</Text>
            <WifiInfoCard
              wifiInfo={wifiInfo}
              theme={theme}
              onRefresh={handleRefresh}
              refreshing={refreshing}
            />
          </GlassView>

          {/* 无需认证提示 */}
          <GlassView style={styles.card}>
            <View style={styles.warningCardContent}>
              <Text style={styles.warningIcon}>✅</Text>
              <Text style={[styles.warningTitle, { color: theme.colors.success }]}>无需认证</Text>
              <Text style={[styles.warningText, { color: theme.colors.textSecondary }]}>
                当前 WiFi 无需校园网认证，可直接使用。
              </Text>
              <View
                style={[
                  styles.warningBox,
                  {
                    backgroundColor: theme.colors.success + '20',
                    borderColor: theme.colors.success + '40',
                  },
                ]}
              >
                <Text style={[styles.warningBoxText, { color: theme.colors.textSecondary }]}>
                  此 WiFi 已配置为"无需认证"（如家庭 WiFi、手机热点等）
                </Text>
              </View>
            </View>
          </GlassView>
        </ScrollView>
      </View>
    );
  }

  // 第四优先级：检查是否有关联账户
  const linkedAccount = config.accounts.find(account =>
    wifiConfig.linkedAccountIds.includes(account.id)
  );

  if (!linkedAccount) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.pageTitle, { color: theme.colors.text }]}>运行状态</Text>

          {/* WiFi 基础信息 */}
          <GlassView style={styles.card}>
            <Text style={[styles.cardHeader, { color: theme.colors.text }]}>当前 WiFi</Text>
            <WifiInfoCard
              wifiInfo={wifiInfo}
              theme={theme}
              onRefresh={handleRefresh}
              refreshing={refreshing}
            />
          </GlassView>

          {/* 未配置账户警告 */}
          <GlassView style={styles.card}>
            <View style={styles.warningCardContent}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <Text style={[styles.warningTitle, { color: theme.colors.warning }]}>未配置账户</Text>
              <Text style={[styles.warningText, { color: theme.colors.textSecondary }]}>
                该 WiFi 需要校园网认证，但尚未关联账户。请前往"配置设置"添加账户并关联到此 WiFi。
              </Text>
              <View
                style={[
                  styles.warningBox,
                  {
                    backgroundColor: theme.colors.warning + '20',
                    borderColor: theme.colors.warning + '40',
                  },
                ]}
              >
                <Text style={[styles.warningBoxText, { color: theme.colors.textSecondary }]}>
                  ⚙️ 点击底部菜单的"配置设置"添加账户并关联
                </Text>
              </View>
            </View>
          </GlassView>
        </ScrollView>
      </View>
    );
  }

  // 显示完整认证界面
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { color: theme.colors.text }]}>运行状态</Text>

        {/* Network Status Card */}
        <GlassView style={styles.card}>
          <Text style={[styles.cardHeader, { color: theme.colors.text }]}>网络状态</Text>

          <View style={styles.statusContainer}>
            <Animated.View
              style={[
                styles.badge,
                animatedBadgeStyle,
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
                {getStatusText(networkStatus)}
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
            onPress={networkStatus === 'connected' ? logout : login}
            disabled={networkStatus === 'connecting'}
            activeOpacity={0.8}
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

        {/* Current Account Card */}
        <GlassView style={styles.card}>
          <Text style={[styles.cardHeader, { color: theme.colors.text }]}>当前账号</Text>

          <View style={styles.accountInfoContainer}>
            <View style={styles.infoRow}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>用户名</Text>
              <Text style={[styles.value, { color: theme.colors.text }]}>
                {linkedAccount.username}
              </Text>
            </View>
            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>服务器</Text>
              <Text style={[styles.value, { color: theme.colors.text }]}>
                {linkedAccount.serverUrl}
              </Text>
            </View>
          </View>
        </GlassView>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
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
    marginTop: 0,
  },
  card: {
    padding: 24,
    marginBottom: 24,
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    paddingBottom: 16,
  },
  statusContainer: {
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  ipText: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 24,
  },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 50,
    borderWidth: 1.5,
  },
  badgeText: {
    fontWeight: '700',
    fontSize: 14,
  },
  btn: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  btnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  accountInfoContainer: {
    backgroundColor: 'transparent',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
    backgroundColor: 'transparent',
  },
  warningCardContent: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  warningIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  warningTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  warningText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
    lineHeight: 22,
  },
  warningBox: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    width: '100%',
  },
  warningBoxText: {
    fontSize: 14,
    textAlign: 'center',
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 15,
  },
});
