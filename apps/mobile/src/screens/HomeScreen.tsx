import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { theme } from '../constants/theme';

export const HomeScreen: React.FC = () => {
  const { networkStatus, ipAddress, login, logout, config } = useApp();
  const currentAccount = config.accounts.find(a => a.id === config.currentAccountId);

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected': return '已连接';
      case 'disconnected': return '未连接';
      case 'connecting': return '连接中...';
      default: return status;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.pageTitle}>运行状态</Text>

      {/* Network Status Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>网络状态</Text>

        <View style={styles.statusContainer}>
            <View style={[
                styles.badge,
                networkStatus === 'connected' ? styles.borderSuccess :
                networkStatus === 'disconnected' ? styles.borderDanger : styles.borderWarning
            ]}>
                <Text style={[
                  styles.badgeText,
                  networkStatus === 'connected' ? { color: '#166534' } :
                  networkStatus === 'disconnected' ? { color: '#991b1b' } : { color: '#854d0e' }
                ]}>{getStatusText(networkStatus)}</Text>
            </View>
        </View>

        {networkStatus === 'connected' && (
             <Text style={styles.ipText}>IP: {ipAddress}</Text>
        )}

        <TouchableOpacity
            style={[
                styles.btn,
                networkStatus === 'connected' ? styles.btnDanger : styles.btnPrimary,
            ]}
            onPress={networkStatus === 'connected' ? logout : login}
            disabled={networkStatus === 'connecting'}
        >
            <Text style={styles.btnText}>
                {networkStatus === 'connected' ? '断开连接' : networkStatus === 'connecting' ? '正在连接...' : '立即连接'}
            </Text>
        </TouchableOpacity>
      </View>

      {/* Current Account Card */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>当前账号</Text>
        
        {currentAccount ? (
            <View style={styles.accountInfoContainer}>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>用户名</Text>
                  <Text style={styles.value}>{currentAccount.username}</Text>
                </View>
                <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.label}>服务器</Text>
                  <Text style={styles.value}>{currentAccount.serverUrl}</Text>
                </View>
            </View>
        ) : (
            <Text style={styles.emptyText}>尚未选择账号</Text>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  contentContainer: {
    padding: 24,
    paddingTop: 32,
    paddingBottom: 100,
  },
  pageTitle: {
    fontSize: 28, // Desktop: 2.2rem (~35px)
    fontWeight: '800',
    marginBottom: 32,
    color: '#0c4a6e',
    marginTop: 0,
  },
  card: {
    backgroundColor: theme.colors.cardBg, // Use consistent opaque theme color
    borderRadius: theme.roundness.l, // 24px
    padding: 24, // Desktop: 32px
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.colors.border, // Solid white border
    // Shadow Glass Effect
    shadowColor: '#0ea5e9', 
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 5,
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0c4a6e',
    marginBottom: 20,
    paddingBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.75)', // 确保无背景
  },
  statusContainer: {
    alignItems: 'flex-start',
    marginBottom: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.75)', // 确保无背景
  },
  ipText: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 24,
    color: theme.colors.text,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.roundness.pill,
    borderWidth: 1.5,
    backgroundColor: 'transparent', // 彻底透明，直接透出卡片的玻璃背景
  },
  badgeText: {
    fontWeight: '700',
    fontSize: 14,
  },
  borderSuccess: { borderColor: 'rgba(34, 197, 94, 0.4)' },
  borderDanger: { borderColor: 'rgba(239, 68, 68, 0.4)' },
  borderWarning: { borderColor: 'rgba(245, 158, 11, 0.4)' },
  
  btn: {
    paddingVertical: 14,
    borderRadius: theme.roundness.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { 
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  btnDanger: { 
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  btnText: { 
    color: '#fff', 
    fontWeight: '600',
    fontSize: 16 
  },
  
  accountInfoContainer: {
    backgroundColor: 'transparent',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    backgroundColor: 'transparent',
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  value: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
    backgroundColor: 'transparent',
  }
});