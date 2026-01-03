import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { GlassView } from '../components/GlassView';

/* eslint-disable react-native/no-inline-styles */
// Inline styles necessary for dynamic theme-based colors

type LogLevel = 'all' | 'info' | 'success' | 'warn' | 'error' | 'debug';

const LOG_LEVEL_OPTIONS: { value: LogLevel; label: string; emoji: string }[] = [
  { value: 'all', label: '全部', emoji: '📋' },
  { value: 'info', label: '信息', emoji: 'ℹ️' },
  { value: 'success', label: '成功', emoji: '✅' },
  { value: 'warn', label: '警告', emoji: '⚠️' },
  { value: 'error', label: '错误', emoji: '❌' },
  { value: 'debug', label: '调试', emoji: '🐛' },
];

export const LogsScreen: React.FC = () => {
  const { logs, clearLogs } = useApp();
  const { theme } = useTheme();
  const [filterLevel, setFilterLevel] = useState<LogLevel>('all');

  const filteredLogs = useMemo(() => {
    if (filterLevel === 'all') return logs;
    return logs.filter(log => log.level === filterLevel);
  }, [logs, filterLevel]);

  const getLogColor = (level: string) => {
    switch (level) {
      case 'info':
        return theme.colors.primary;
      case 'success':
        return theme.colors.success;
      case 'warn':
        return theme.colors.warning;
      case 'error':
        return theme.colors.danger;
      case 'debug':
        return '#a855f7';
      default:
        return theme.colors.primary;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <Text style={[styles.pageTitle, { color: theme.colors.text }]}>运行日志</Text>

      <GlassView style={styles.card}>
        {/* Filter Section */}
        <View style={styles.filterSection}>
          <Text style={[styles.filterLabel, { color: theme.colors.textSecondary }]}>筛选级别</Text>
          <View style={styles.filterContainer}>
            {LOG_LEVEL_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setFilterLevel(opt.value)}
                style={[
                  styles.filterButton,
                  {
                    backgroundColor:
                      filterLevel === opt.value ? getLogColor(opt.value) + '20' : 'transparent',
                    borderColor:
                      filterLevel === opt.value
                        ? getLogColor(opt.value)
                        : theme.colors.border + '60',
                    borderWidth: filterLevel === opt.value ? 1.5 : 1,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text style={styles.filterEmoji}>{opt.emoji}</Text>
                <Text
                  style={[
                    styles.filterText,
                    {
                      color:
                        filterLevel === opt.value
                          ? getLogColor(opt.value)
                          : theme.colors.textSecondary,
                      fontWeight: filterLevel === opt.value ? '700' : '500',
                    },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Header */}
        <View style={[styles.headerContainer, { borderBottomColor: theme.colors.border + '20' }]}>
          <Text style={[styles.logCount, { color: theme.colors.textSecondary }]}>
            共 {filteredLogs.length} 条{filterLevel !== 'all' && ` (筛选自 ${logs.length} 条)`}
          </Text>
          {logs.length > 0 && (
            <TouchableOpacity
              onPress={clearLogs}
              style={[styles.clearButton, { backgroundColor: theme.colors.danger + '15' }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.clearButtonText, { color: theme.colors.danger }]}>清空日志</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Logs Content */}
        <ScrollView style={styles.logsContainer} showsVerticalScrollIndicator={false}>
          {filteredLogs.length > 0 ? (
            filteredLogs.map(log => (
              <View
                key={log.id}
                style={[
                  styles.logItem,
                  {
                    backgroundColor: theme.colors.cardBg + '40',
                    borderColor: theme.colors.border + '20',
                  },
                ]}
              >
                <View style={styles.logHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={[styles.logDot, { backgroundColor: getLogColor(log.level) }]} />
                    <Text style={[styles.level, { color: getLogColor(log.level) }]}>
                      {log.level.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.timestamp, { color: theme.colors.textSecondary }]}>
                    {log.timestamp}
                  </Text>
                </View>
                <Text style={[styles.message, { color: theme.colors.text }]}>{log.message}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 40, marginBottom: 16 }}>📝</Text>
              <Text style={[styles.noLogs, { color: theme.colors.textSecondary }]}>
                {filterLevel === 'all'
                  ? '暂无日志记录'
                  : `暂无 ${LOG_LEVEL_OPTIONS.find(o => o.value === filterLevel)?.label} 级别的日志`}
              </Text>
            </View>
          )}
          <View style={{ height: 40 }} />
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
    marginBottom: 24,
  },
  card: {
    flex: 1,
    padding: 0,
    marginBottom: 80,
    overflow: 'hidden',
  },
  filterSection: {
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.7,
  },
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: -8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  filterEmoji: {
    fontSize: 12,
    marginRight: 4,
  },
  filterText: {
    fontSize: 12,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  logCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  clearButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  clearButtonText: {
    fontSize: 11,
    fontWeight: '700',
  },
  logsContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  logItem: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  logDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  level: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timestamp: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    opacity: 0.7,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  noLogs: {
    textAlign: 'center',
    fontSize: 14,
  },
});
