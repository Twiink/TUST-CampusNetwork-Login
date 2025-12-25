import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { useApp } from '../context/AppContext';
import { theme } from '../constants/theme';

export const LogsScreen: React.FC = () => {
  const { logs } = useApp();

  return (
    <View style={styles.container}>
      <Text style={styles.pageTitle}>运行日志</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardHeader}>系统日志</Text>
        <ScrollView style={styles.logsContainer}>
          {logs.length > 0 ? (
            logs.map((log) => (
              <View key={log.id} style={styles.logItem}>
                <Text style={styles.timestamp}>[{log.timestamp}]</Text>
                <Text style={[styles.level, styles[`level_${log.level}`]]}>
                  [{log.level.toUpperCase()}]
                </Text>
                <Text style={styles.message}>{log.message}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.noLogs}>暂无日志记录。</Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: 24,
    paddingTop: 32,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0c4a6e',
    marginBottom: 32,
  },
  card: {
    flex: 1,
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.roundness.l,
    padding: 24,
    marginBottom: 100, // Leave space for BottomTab
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 32,
    elevation: 4,
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0c4a6e',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(14, 165, 233, 0.1)',
  },
  logsContainer: {
    flex: 1,
  },
  logItem: {
    flexDirection: 'row',
    marginBottom: 12,
    flexWrap: 'wrap',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.03)',
    paddingBottom: 8,
  },
  timestamp: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginRight: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  level: {
    fontSize: 12,
    fontWeight: '700',
    marginRight: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  level_info: { color: theme.colors.primary },
  level_success: { color: '#22c55e' },
  level_warn: { color: '#eab308' },
  level_error: { color: '#ef4444' },
  message: {
    fontSize: 14,
    color: theme.colors.text,
    flex: 1,
    lineHeight: 20,
  },
  noLogs: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    marginTop: 40,
  },
});