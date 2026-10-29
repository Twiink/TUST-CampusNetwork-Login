import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Platform,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LOG_LEVEL_LABELS, logTime, mergeLogs, type LogHistoryFilter } from '@repo/shared';
import { useApp, type LogEntry } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { copyLog } from '../native/Logs';

/* eslint-disable react-native/no-inline-styles */
const levels = ['all', 'info', 'success', 'warn', 'error', 'debug'] as const;
const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
export const LogsScreen: React.FC = () => {
  const {
    logs,
    clearLogs,
    exportLogs,
    loadMoreLogs,
    queryLogs,
    refreshLogs,
    hasMoreLogs,
    logsTotal,
    logsLoading,
    logError,
  } = useApp();
  const { theme, themeMode } = useTheme();
  const dark = themeMode === 'dark';
  const [filter, setFilter] = useState<LogHistoryFilter>({});
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [panel, setPanel] = useState(false);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [format, setFormat] = useState<'text' | 'json'>('text');
  const [scope, setScope] = useState<'all' | 'filtered'>('all');
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(logs);
  const list = useRef<FlatList<LogEntry>>(null);
  const following = useRef(true);
  useEffect(() => {
    setVisible(previous => {
      if (following.current || !logs.length || !previous.length) return logs;
      const boundary = previous[0];
      const older = logs.filter(
        entry =>
          logTime(entry) < logTime(boundary) ||
          entry.id === boundary.id ||
          (logTime(entry) === logTime(boundary) && entry.id < boundary.id)
      );
      return mergeLogs(
        previous.filter(entry => logs.some(log => log.id === entry.id)),
        older
      );
    });
  }, [logs]);
  useEffect(() => {
    queryLogs({}).catch(() => undefined);
  }, [queryLogs]);
  const visibleIds = new Set(visible.map(entry => entry.id));
  const newCount = logs.filter(entry => !visibleIds.has(entry.id)).length;
  const hasFilter = Object.values(filter).some(value => value && value !== 'all');
  const color = (level: string) =>
    ({
      info: dark ? '#7dd3fc' : '#0369a1',
      success: dark ? '#6ee7b7' : '#047857',
      warn: dark ? '#fcd34d' : '#92400e',
      error: dark ? '#fca5a5' : '#b91c1c',
      debug: dark ? '#d8b4fe' : '#7e22ce',
    })[level] ?? theme.colors.text;
  const button = (text: string, action: () => void, active = false, disabled = false) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ selected: active, disabled }}
      key={text}
      onPress={action}
      disabled={disabled}
      style={[
        styles.button,
        {
          borderColor: active ? theme.colors.primary : theme.colors.textSecondary,
          backgroundColor: active ? theme.colors.bgSecondary : 'transparent',
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: active ? '600' : '400' }}>
        {text}
      </Text>
    </TouchableOpacity>
  );
  const runQuery = async (next: LogHistoryFilter) => {
    following.current = true;
    setFilter(next);
    setError('');
    await queryLogs(next).catch(() => undefined);
    list.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const apply = async () => {
    const start = from.trim() ? new Date(from.trim().replace(' ', 'T')).getTime() : undefined;
    const end = to.trim() ? new Date(to.trim().replace(' ', 'T')).getTime() : undefined;
    if (
      (start !== undefined && !Number.isFinite(start)) ||
      (end !== undefined && !Number.isFinite(end)) ||
      (start !== undefined && end !== undefined && start > end)
    ) {
      setError('请输入有效时间，开始时间应早于结束时间');
      return;
    }
    setPanel(false);
    await runQuery({ ...filter, keyword, source, startTime: start, endTime: end });
  };
  const doExport = async () => {
    setExporting(true);
    setNotice('');
    setError('');
    try {
      await exportLogs(format, scope === 'filtered' ? filter : undefined);
      setNotice('导出文件已生成，请在系统分享面板中保存或分享');
    } catch (err) {
      setError(err instanceof Error ? err.message : '日志导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };
  const detail = selected
    ? `${new Date(selected.timestamp).toLocaleString()} [${LOG_LEVEL_LABELS[selected.level]}] ${selected.source ?? selected.category ?? '应用'}\n${selected.message}${selected.data === undefined ? '' : `\n\n${JSON.stringify(selected.data, null, 2)}`}`
    : '';
  const fieldStyle = [
    styles.input,
    {
      color: theme.colors.text,
      borderColor: theme.colors.textSecondary,
      backgroundColor: theme.colors.bg,
    },
  ];
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <View style={styles.heading}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.colors.text }]}>运行日志</Text>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
            连接、认证与恢复记录，保留最近 7 天
          </Text>
        </View>
        {button('刷新', () => refreshLogs().catch(() => undefined), false, logsLoading)}
      </View>
      <View
        style={[
          styles.workspace,
          { backgroundColor: theme.colors.cardBg, borderColor: theme.colors.cardBorder },
        ]}
      >
        <View style={[styles.toolbar, { borderBottomColor: theme.colors.border }]}>
          <TextInput
            accessibilityLabel="搜索全部历史日志"
            placeholder="搜索消息或详情"
            placeholderTextColor={theme.colors.textSecondary}
            style={[...fieldStyle, { flex: 1 }]}
            value={keyword}
            onChangeText={setKeyword}
            returnKeyType="search"
            onSubmitEditing={() => runQuery({ ...filter, keyword })}
          />
          {button(
            '筛选',
            () => setPanel(true),
            !!filter.source || !!filter.startTime || !!filter.endTime
          )}
        </View>
        <View style={styles.levels}>
          {levels.map(level =>
            button(
              level === 'all' ? '全部' : LOG_LEVEL_LABELS[level],
              () => runQuery({ ...filter, keyword, level }),
              (filter.level ?? 'all') === level
            )
          )}
        </View>
        <View style={styles.statusLine}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 11 }}>
            共 {Math.max(logsTotal, logs.length)} 条，已加载 {logs.length} 条
          </Text>
          {logsLoading && <ActivityIndicator size="small" color={theme.colors.primary} />}
        </View>
        {(error || logError) && (
          <Text accessibilityRole="alert" style={[styles.feedback, { color: color('error') }]}>
            {error || logError}
          </Text>
        )}
        {!!notice && (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.feedback, { color: theme.colors.text }]}
          >
            {notice}
          </Text>
        )}
        {newCount > 0 &&
          button(`${newCount} 条新日志，点击查看`, () => {
            following.current = true;
            setVisible(logs);
            list.current?.scrollToOffset({ offset: 0 });
          })}
        <FlatList
          ref={list}
          style={styles.list}
          data={visible}
          keyExtractor={entry => entry.id}
          initialNumToRender={16}
          maxToRenderPerBatch={16}
          windowSize={7}
          removeClippedSubviews
          onScroll={event => {
            following.current = event.nativeEvent.contentOffset.y < 10;
          }}
          scrollEventThrottle={100}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                {logsLoading
                  ? '正在读取日志…'
                  : logError
                    ? '日志读取失败'
                    : Object.values(filter).some(value => value && value !== 'all')
                      ? '没有匹配的日志'
                      : '暂无日志记录'}
              </Text>
              <Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
                {logError ? '点击刷新重试' : '连接、认证或设置变更后，记录会显示在这里'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`${LOG_LEVEL_LABELS[item.level]}，${item.source ?? '应用'}，${item.message}`}
              onPress={() => {
                setSelected(item);
                setNotice('');
                setError('');
              }}
              style={[styles.row, { borderBottomColor: theme.colors.border }]}
            >
              <View style={styles.meta}>
                <Text style={[styles.time, { color: theme.colors.textSecondary }]}>
                  {new Date(item.timestamp).toLocaleString()}
                </Text>
                <Text
                  style={[
                    styles.badge,
                    { color: color(item.level), backgroundColor: theme.colors.bg },
                  ]}
                >
                  {LOG_LEVEL_LABELS[item.level]}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.source, { color: theme.colors.textSecondary }]}
                >
                  {item.source ?? item.category ?? '应用'}
                </Text>
              </View>
              <Text numberOfLines={2} style={[styles.message, { color: theme.colors.text }]}>
                {item.message}
              </Text>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            hasMoreLogs
              ? button(
                  logsLoading ? '正在加载…' : '加载历史日志',
                  () => loadMoreLogs().catch(() => undefined),
                  false,
                  logsLoading
                )
              : null
          }
        />
        <View style={[styles.exportPanel, { borderTopColor: theme.colors.border }]}>
          <View style={styles.wrap}>
            {button('全部保留日志', () => setScope('all'), scope === 'all')}
            {button('当前筛选结果', () => setScope('filtered'), scope === 'filtered')}
            {button('LOG', () => setFormat('text'), format === 'text')}
            {button('JSON', () => setFormat('json'), format === 'json')}
          </View>
          <View style={styles.wrap}>
            {button(
              exporting ? '正在导出…' : '导出日志',
              () => doExport(),
              true,
              exporting || ((!hasFilter || scope === 'filtered') && !logs.length && !logsTotal)
            )}
            {button(
              '清空日志',
              () => clearLogs().catch(() => setError('日志清空失败，请重试')),
              false,
              logsLoading || (!hasFilter && !logs.length && !logsTotal)
            )}
          </View>
        </View>
      </View>
      <Modal
        visible={panel}
        transparent
        animationType="slide"
        onRequestClose={() => setPanel(false)}
      >
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: theme.colors.bg }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={[styles.modalTitle, { color: theme.colors.text }]}>筛选全部历史</Text>
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>来源</Text>
              <TextInput
                accessibilityLabel="来源"
                placeholder="全部来源"
                placeholderTextColor={theme.colors.textSecondary}
                style={fieldStyle}
                value={source}
                onChangeText={setSource}
              />
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                开始时间（如 2026-10-28 08:00）
              </Text>
              <TextInput
                accessibilityLabel="开始时间"
                placeholder="不限开始时间"
                placeholderTextColor={theme.colors.textSecondary}
                style={fieldStyle}
                value={from}
                onChangeText={setFrom}
              />
              <Text style={[styles.label, { color: theme.colors.textSecondary }]}>结束时间</Text>
              <TextInput
                accessibilityLabel="结束时间"
                placeholder="不限结束时间"
                placeholderTextColor={theme.colors.textSecondary}
                style={fieldStyle}
                value={to}
                onChangeText={setTo}
              />
              {!!error && <Text style={{ color: color('error'), marginTop: 12 }}>{error}</Text>}
              <View style={[styles.wrap, { marginTop: 20 }]}>
                {button('应用筛选', () => apply(), true)}
                {button('重置筛选', () => {
                  setFrom('');
                  setTo('');
                  setSource('');
                  setKeyword('');
                  setPanel(false);
                  runQuery({});
                })}
                {button('关闭', () => setPanel(false))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={[styles.detail, { backgroundColor: theme.colors.bg }]}>
          <View style={styles.heading}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>日志详情</Text>
            {button('关闭详情', () => setSelected(null))}
          </View>
          <ScrollView contentContainerStyle={styles.detailBody}>
            {selected && (
              <>
                <Text style={[styles.badge, { color: color(selected.level) }]}>
                  {LOG_LEVEL_LABELS[selected.level]}
                </Text>
                <Text
                  style={[styles.time, { color: theme.colors.textSecondary, marginVertical: 14 }]}
                >
                  {new Date(selected.timestamp).toLocaleString()}
                </Text>
                <Text style={{ color: theme.colors.textSecondary }}>
                  {selected.source ?? selected.category ?? '应用'}
                </Text>
                <Text selectable style={[styles.fullMessage, { color: theme.colors.text }]}>
                  {selected.message}
                </Text>
                {selected.data !== undefined && (
                  <Text
                    selectable
                    style={[
                      styles.data,
                      { color: theme.colors.text, backgroundColor: theme.colors.bgSecondary },
                    ]}
                  >
                    {JSON.stringify(selected.data, null, 2)}
                  </Text>
                )}
              </>
            )}
          </ScrollView>
          {!!notice && (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.feedback, { color: theme.colors.text }]}
            >
              {notice}
            </Text>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={[styles.feedback, { color: color('error') }]}>
              {error}
            </Text>
          )}
          {button(
            '复制详情',
            () =>
              copyLog(detail)
                .then(() => setNotice('已复制日志详情'))
                .catch(() => setError('复制失败，请选择文本复制')),
            true
          )}
        </View>
      </Modal>
    </View>
  );
};
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 6 },
  workspace: { flex: 1, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
  },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 13 },
  levels: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 10, gap: 6 },
  button: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  feedback: { paddingHorizontal: 12, paddingBottom: 12, fontSize: 12, lineHeight: 18 },
  list: { flex: 1 },
  row: { paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, minHeight: 76 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  time: { fontFamily: mono, fontSize: 10 },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  source: { fontSize: 10, flex: 1 },
  message: { fontSize: 13, lineHeight: 20 },
  empty: { paddingHorizontal: 16, paddingVertical: 42, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '500' },
  exportPanel: { borderTopWidth: 1, padding: 12, gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: { padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalTitle: { fontSize: 20, fontWeight: '600' },
  label: { fontSize: 12, marginTop: 20, marginBottom: 8 },
  detail: { flex: 1, padding: 20, paddingTop: 44 },
  detailBody: { paddingBottom: 24 },
  fullMessage: { fontSize: 15, lineHeight: 25, marginVertical: 22 },
  data: { fontSize: 12, lineHeight: 20, fontFamily: mono, padding: 14, borderRadius: 8 },
});
