import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, AppState } from 'react-native';
import {
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

import { WifiInfoCard } from '../components/wifi/WifiInfoCard';
import {
  HomeNoticeCard,
  NetworkStatusCard,
  CurrentAccountCard,
} from '../components/home/HomeCards';
import { styles } from '../components/home/homeScreenStyles';

export const HomeScreen: React.FC = () => {
  const { networkStatus, ipAddress, login, logout, config } = useApp();
  const { theme } = useTheme();
  const [wifiInfo, setWifiInfo] = useState<WifiModule.NetworkInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const fallbackTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pulse animation for status badge
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);

  // 获取当前 WiFi 连接状态和详细信息
  const wifiConnected = wifiInfo?.connected ?? false;
  const wifiSSID = wifiInfo?.ssid || '';

  // 加载WiFi信息
  const loadWifiInfo = useCallback(async () => {
    try {
      const info = await WifiModule.getNetworkInfo();
      setWifiInfo(info);
    } catch (error) {
      console.error('Failed to load WiFi info:', error);
    }
  }, []);

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

  // 原生 netmate:wifiChanged 事件驱动 + 30s 兜底轮询；后台态暂停
  useEffect(() => {
    WifiModule.startWatching().catch(() => undefined);
    loadWifiInfo().catch(() => undefined);

    const subscription = WifiModule.onWifiChanged(() => {
      loadWifiInfo().catch(() => undefined);
    });

    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        loadWifiInfo().catch(() => undefined);
        if (!fallbackTimer.current) {
          fallbackTimer.current = setInterval(loadWifiInfo, 30000);
        }
      } else if (fallbackTimer.current) {
        clearInterval(fallbackTimer.current);
        fallbackTimer.current = null;
      }
    });

    fallbackTimer.current = setInterval(loadWifiInfo, 30000);

    return () => {
      subscription?.remove();
      appStateSubscription.remove();
      if (fallbackTimer.current) {
        clearInterval(fallbackTimer.current);
        fallbackTimer.current = null;
      }
      WifiModule.stopWatching().catch(() => undefined);
    };
  }, [loadWifiInfo]);

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

          <HomeNoticeCard
            icon="⚠️"
            tint={theme.colors.warning}
            title="该 WiFi 未配置"
            description={`当前连接的 WiFi "${wifiSSID}" 尚未配置，请前往"配置设置"添加此 WiFi 的配置。`}
            hint='⚙️ 点击底部菜单的"配置设置"添加 WiFi 配置'
            theme={theme}
          />
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

          <HomeNoticeCard
            icon="✅"
            tint={theme.colors.success}
            title="无需认证"
            description="当前 WiFi 无需校园网认证，可直接使用。"
            hint='此 WiFi 已配置为"无需认证"（如家庭 WiFi、手机热点等）'
            theme={theme}
          />
        </ScrollView>
      </View>
    );
  }

  // 第四优先级：按关联顺序取第一个仍存在的账户；兼容旧版单字段配置。
  const linkedAccountId =
    wifiConfig.linkedAccountIds.find(id => config.accounts.some(account => account.id === id)) ??
    wifiConfig.linkedAccountId;
  const linkedAccount = config.accounts.find(account => account.id === linkedAccountId);

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

          <HomeNoticeCard
            icon="⚠️"
            tint={theme.colors.warning}
            title="未配置账户"
            description='该 WiFi 需要校园网认证，但尚未关联账户。请前往"配置设置"添加账户并关联到此 WiFi。'
            hint='⚙️ 点击底部菜单的"配置设置"添加账户并关联'
            theme={theme}
          />
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

        <NetworkStatusCard
          networkStatus={networkStatus}
          statusText={getStatusText(networkStatus)}
          ipAddress={ipAddress}
          onLogin={login}
          onLogout={logout}
          theme={theme}
          badgeStyle={animatedBadgeStyle}
          pulseOpacity={pulseOpacity}
        />

        <CurrentAccountCard
          username={linkedAccount.username}
          serverUrl={linkedAccount.serverUrl}
          theme={theme}
        />
      </ScrollView>
    </View>
  );
};
