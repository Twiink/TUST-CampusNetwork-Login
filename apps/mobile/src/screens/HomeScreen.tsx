import React, { useEffect } from 'react';
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
import { GlassCard } from '../components/GlassCard';
import { GlassView } from '../components/GlassView';

export const HomeScreen: React.FC = () => {
  const { networkStatus, ipAddress, login, logout, config } = useApp();
  const { theme } = useTheme();
  const currentAccount = config.accounts.find(a => a.id === config.currentAccountId);
  const hasAccounts = config.accounts && config.accounts.length > 0;

  // Pulse animation for status badge
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);

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

  // 未配置账户的状态
  if (!hasAccounts) {
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
              <Text style={styles.warningIcon}>⚠️</Text>
              <Text style={[styles.warningTitle, { color: theme.colors.warning }]}>未配置账户</Text>
              <Text style={[styles.warningText, { color: theme.colors.textSecondary }]}>
                请先前往"配置设置"添加校园网账户，才能使用登录功能。
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
                  ⚙️ 点击底部菜单的"配置设置"添加账户
                </Text>
              </View>
            </View>
          </GlassView>

          <GlassView style={styles.card}>
            <Text style={[styles.cardHeader, { color: theme.colors.text }]}>网络信息</Text>
            <View style={styles.emptyStateContainer}>
              <Text style={styles.emptyStateIcon}>📡</Text>
              <Text style={[styles.emptyStateText, { color: theme.colors.textSecondary }]}>
                等待配置账户...
              </Text>
            </View>
          </GlassView>
        </ScrollView>
      </View>
    );
  }

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

          {currentAccount ? (
            <View style={styles.accountInfoContainer}>
              <View style={styles.infoRow}>
                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>用户名</Text>
                <Text style={[styles.value, { color: theme.colors.text }]}>
                  {currentAccount.username}
                </Text>
              </View>
              <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>服务器</Text>
                <Text style={[styles.value, { color: theme.colors.text }]}>
                  {currentAccount.serverUrl}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              尚未选择账号
            </Text>
          )}
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
