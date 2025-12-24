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
      <Text style={styles.title}>运行状态</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>网络状态</Text>
        <View style={styles.statusContainer}>
            <View style={[
                styles.badge, 
                networkStatus === 'connected' ? styles.bgSuccess : 
                networkStatus === 'disconnected' ? styles.bgDanger : styles.bgWarning
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>当前账号</Text>
        {currentAccount ? (
            <View style={styles.accountInfo}>
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
    padding: theme.spacing.m,
    paddingTop: theme.spacing.xl,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: theme.spacing.l,
    color: '#0c4a6e',
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  card: {
    backgroundColor: theme.colors.cardBg,
    padding: theme.spacing.l,
    borderRadius: theme.roundness.l,
    marginBottom: theme.spacing.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
    // Softer shadow for light mode
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: theme.spacing.m,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
  },
  statusContainer: {
    alignItems: 'flex-start',
    marginBottom: theme.spacing.m,
  },
  ipText: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: theme.spacing.l,
    color: theme.colors.text,
  },
  badge: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: theme.roundness.pill,
  },
  badgeText: {
    fontWeight: '800',
    fontSize: 14,
  },
  bgSuccess: { backgroundColor: '#dcfce7' },
  bgDanger: { backgroundColor: '#fee2e2' },
  bgWarning: { backgroundColor: '#fef9c3' },
  
  btn: {
    paddingVertical: 18,
    borderRadius: theme.roundness.m,
    alignItems: 'center',
    marginTop: theme.spacing.s,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPrimary: { backgroundColor: theme.colors.primary },
  btnDanger: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  
  accountInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: theme.roundness.m,
    padding: theme.spacing.m,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  value: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  }
});