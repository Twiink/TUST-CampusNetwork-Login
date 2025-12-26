import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { GlassView } from '../components/GlassView';

export const LogsScreen: React.FC = () => {
  const { logs, clearLogs } = useApp();
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <Text style={[styles.pageTitle, { color: theme.colors.text }]}>运行日志</Text>

      <GlassView style={styles.card}>
        <View
          style={[styles.headerContainer, { borderBottomColor: theme.colors.border + '20' }]}
        >
          <Text style={[styles.cardHeader, { color: theme.colors.text }]}>系统日志</Text>
          <TouchableOpacity
            onPress={clearLogs}
            style={[
              styles.clearButton,
              { backgroundColor: theme.colors.danger + '20' },
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.clearButtonText, { color: theme.colors.danger }]}>清空</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.logsContainer} showsVerticalScrollIndicator={false}>
          {logs.length > 0 ? (
            logs.map((log) => (
              <View
                key={log.id}
                style={[styles.logItem, { borderBottomColor: theme.colors.border + '10' }]}
              >
                <Text style={[styles.timestamp, { color: theme.colors.textSecondary }]}>
                  [{log.timestamp}]
                </Text>
                <Text
                  style={[
                    styles.level,
                    {
                      color:
                        log.level === 'info'
                          ? theme.colors.primary
                          : log.level === 'success'
                          ? theme.colors.success
                          : log.level === 'warn'
                          ? theme.colors.warning
                          : theme.colors.danger,
                    },
                  ]}
                >
                  [{log.level.toUpperCase()}]
                </Text>
                <Text style={[styles.message, { color: theme.colors.text }]}>{log.message}</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.noLogs, { color: theme.colors.textSecondary }]}>
              暂无日志记录。
            </Text>
          )}
        </ScrollView>
      </GlassView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 32,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 32,
  },
  card: {
    flex: 1,
    padding: 24,
    marginBottom: 100, // Leave space for BottomTab
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  cardHeader: {
    fontSize: 18,
    fontWeight: '700',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  logsContainer: {
    flex: 1,
  },
  logItem: {
    flexDirection: 'row',
    marginBottom: 12,
    flexWrap: 'wrap',
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  timestamp: {
    fontSize: 12,
    marginRight: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  level: {
    fontSize: 12,
    fontWeight: '700',
    marginRight: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  message: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  noLogs: {
    textAlign: 'center',
    marginTop: 40,
  },
});
