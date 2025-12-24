import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { theme } from '../constants/theme';

export const LogsScreen: React.FC = () => {
  const { logs } = useApp();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>运行日志</Text>
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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: theme.colors.bg,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0c4a6e',
    marginBottom: 24,
  },
  logsContainer: {
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
    borderRadius: 16,
    padding: 16,
  },
  logItem: {
    flexDirection: 'row',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  timestamp: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginRight: 8,
    fontFamily: 'monospace',
  },
  level: {
    fontSize: 12,
    fontWeight: '700',
    marginRight: 8,
    fontFamily: 'monospace',
  },
  level_info: { color: theme.colors.primary },
  level_success: { color: '#22c55e' },
  level_warn: { color: '#eab308' },
  level_error: { color: '#ef4444' },
  message: {
    fontSize: 14,
    color: theme.colors.text,
    flex: 1,
  },
  noLogs: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    marginTop: 20,
  },
});
