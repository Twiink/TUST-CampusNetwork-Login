import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { theme } from '../constants/theme';

export const HomeScreen: React.FC = () => {
  const { networkStatus, ipAddress, login, logout, config } = useApp();
  const currentAccount = config.accounts.find(a => a.id === config.currentAccountId);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Dashboard</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Network Status</Text>
        <View style={styles.statusContainer}>
            <View style={[
                styles.badge, 
                networkStatus === 'connected' ? styles.bgSuccess : 
                networkStatus === 'disconnected' ? styles.bgDanger : styles.bgWarning
            ]}>
                <Text style={[
                  styles.badgeText,
                  networkStatus === 'connecting' ? { color: '#854d0e' } : {}
                ]}>{networkStatus.toUpperCase()}</Text>
            </View>
        </View>
        
        {networkStatus === 'connected' && (
             <Text style={styles.ipText}>{ipAddress}</Text>
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
                {networkStatus === 'connected' ? 'Disconnect' : networkStatus === 'connecting' ? 'Connecting...' : 'Connect'}
            </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current Account</Text>
        {currentAccount ? (
            <View style={styles.accountInfo}>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Username</Text>
                  <Text style={styles.value}>{currentAccount.username}</Text>
                </View>
                <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.label}>Server</Text>
                  <Text style={styles.value}>{currentAccount.serverUrl}</Text>
                </View>
            </View>
        ) : (
            <Text style={styles.emptyText}>No account selected.</Text>
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
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: theme.spacing.l,
    color: '#0f172a',
    marginTop: theme.spacing.s,
  },
  card: {
    backgroundColor: theme.colors.cardBg,
    padding: theme.spacing.l,
    borderRadius: theme.roundness.l,
    marginBottom: theme.spacing.m,
    // Soft shadow
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: theme.spacing.m,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusContainer: {
    alignItems: 'flex-start',
    marginBottom: theme.spacing.m,
  },
  ipText: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: theme.spacing.l,
    color: theme.colors.text,
  },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.roundness.pill,
  },
  badgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  bgSuccess: { backgroundColor: '#dcfce7' }, // Soft green bg
  bgDanger: { backgroundColor: '#fee2e2' }, // Soft red bg
  bgWarning: { backgroundColor: '#fef9c3' }, // Soft yellow bg
  // Overriding text colors for badges for better contrast on soft backgrounds
  textSuccess: { color: '#166534' },
  textDanger: { color: '#991b1b' },
  
  btn: {
    paddingVertical: 16,
    borderRadius: theme.roundness.pill,
    alignItems: 'center',
    marginTop: theme.spacing.s,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPrimary: { backgroundColor: theme.colors.primary },
  btnDanger: { backgroundColor: theme.colors.danger, shadowColor: theme.colors.danger },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  
  accountInfo: {
    backgroundColor: '#f8fafc',
    borderRadius: theme.roundness.m,
    padding: theme.spacing.m,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  value: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  }
});