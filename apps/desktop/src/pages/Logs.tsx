import React, { useMemo, useState } from 'react';
import { FileText, Search, RefreshCw, Download, Trash2, Copy, FolderOpen, X } from 'lucide-react';
import { LOG_LEVEL_LABELS, type LogEntry, type LogHistoryFilter } from '@repo/shared';
import { useLogs } from '../hooks/useLogs';
import { VirtualLogList } from '../components/logs/VirtualLogList';
import './logs.css';

export const Logs: React.FC = () => {
  const [level, setLevel] = useState<LogHistoryFilter['level']>('all');
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filter = useMemo(
    () => ({
      level,
      keyword,
      source,
      startTime: from ? new Date(from).getTime() : undefined,
      endTime: to ? new Date(to).getTime() : undefined,
    }),
    [level, keyword, source, from, to]
  );
  const hasFilter = level !== 'all' || !!keyword || !!source || !!from || !!to;
  const {
    logs,
    total,
    hasMore,
    loading,
    error,
    newCount,
    showNew,
    fetchLogs,
    clearLogs,
    setFollowing,
  } = useLogs(filter);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [reset, setReset] = useState(0);
  const [format, setFormat] = useState<'text' | 'json'>('text');
  const [scope, setScope] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const handleExport = async () => {
    setExporting(true);
    setActionError('');
    setNotice('');
    try {
      const result = await window.electronAPI.log.exportSave(
        format,
        scope === 'filtered' ? filter : undefined
      );
      if (!result.success) {
        if (result.error !== '用户取消导出') setActionError(result.error ?? '导出失败，请重试');
      } else setNotice(`导出完成：${result.path}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };
  const openDirectory = async () => {
    try {
      const result = await window.electronAPI.log.openDir();
      if (!result.success) setActionError(result.error ?? '打开日志目录失败');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '打开日志目录失败');
    }
  };
  const detail = selected
    ? `${new Date(selected.timestamp).toLocaleString()} [${LOG_LEVEL_LABELS[selected.level]}] ${selected.source ?? selected.category ?? '应用'}\n${selected.message}${selected.data === undefined ? '' : `\n\n${JSON.stringify(selected.data, null, 2)}`}`
    : '';
  return (
    <div className="logs-page-container logs-workspace">
      <header className="logs-heading">
        <div>
          <h2 className="page-title">
            <FileText size={24} />
            运行日志
          </h2>
          <p>连接、认证与恢复记录，保留最近 7 天</p>
        </div>
        <button className="btn btn-secondary" onClick={() => void openDirectory()}>
          <FolderOpen size={16} />
          日志目录
        </button>
      </header>
      <section className="card logs-card">
        <div className="logs-toolbar">
          <label className="log-search">
            <Search size={17} />
            <input
              aria-label="搜索全部历史日志"
              placeholder="搜索消息或详情"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
          <label>
            来源
            <input
              aria-label="来源"
              placeholder="全部来源"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
          </label>
          <label>
            开始时间
            <input
              aria-label="开始时间"
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            结束时间
            <input
              aria-label="结束时间"
              type="datetime-local"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <button className="btn btn-secondary" disabled={loading} onClick={() => void fetchLogs()}>
            <RefreshCw size={16} />
            刷新
          </button>
        </div>
        <div className="logs-controls">
          <div className="log-levels" aria-label="日志级别">
            {(['all', 'info', 'success', 'warn', 'error', 'debug'] as const).map((value) => (
              <button
                className={`log-filter ${level === value ? 'is-selected' : ''}`}
                key={value}
                aria-pressed={level === value}
                onClick={() => {
                  setLevel(value);
                  setReset((x) => x + 1);
                }}
              >
                {value === 'all' ? '全部' : LOG_LEVEL_LABELS[value]}
              </button>
            ))}
          </div>
          <span className="logs-count">
            共 {Math.max(total, logs.length)} 条，已加载 {logs.length} 条
          </span>
        </div>
        {(error || actionError) && (
          <div className="logs-feedback is-error" role="alert">
            {actionError || error}
          </div>
        )}
        {notice && (
          <div className="logs-feedback" role="status">
            {notice}
          </div>
        )}
        {newCount > 0 && (
          <button
            className="logs-new"
            onClick={() => {
              showNew();
              setReset((x) => x + 1);
            }}
          >
            {newCount} 条新日志，点击查看
          </button>
        )}
        <div className={`logs-content ${selected ? 'has-detail' : ''}`}>
          <div className="logs-list-pane">
            {logs.length ? (
              <VirtualLogList
                logs={logs}
                selectedId={selected?.id}
                onSelect={setSelected}
                onFollowing={setFollowing}
                resetKey={reset}
              />
            ) : (
              <div className="logs-empty" role="status">
                <FileText size={34} />
                <strong>
                  {loading
                    ? '正在读取日志…'
                    : error
                      ? '日志读取失败'
                      : level !== 'all' || keyword || source || from || to
                        ? '没有匹配的日志'
                        : '暂无日志记录'}
                </strong>
                <span>{error ? '点击刷新重试' : '记录会在连接、认证或设置变更后显示'}</span>
              </div>
            )}
            {hasMore && (
              <button
                className="logs-load"
                disabled={loading}
                onClick={() => void fetchLogs('more')}
              >
                {loading ? '正在加载…' : '加载历史日志'}
              </button>
            )}
          </div>
          {selected && (
            <aside className="log-detail" aria-label="日志详情">
              <header>
                <h3>日志详情</h3>
                <button
                  className="log-icon-button"
                  aria-label="关闭详情"
                  onClick={() => setSelected(null)}
                >
                  <X size={18} />
                </button>
              </header>
              <span className={`log-level level-${selected.level}`}>
                {LOG_LEVEL_LABELS[selected.level]}
              </span>
              <time>{new Date(selected.timestamp).toLocaleString()}</time>
              <p className="log-detail-source">{selected.source ?? selected.category ?? '应用'}</p>
              <p className="log-detail-message">{selected.message}</p>
              {selected.data !== undefined && <pre>{JSON.stringify(selected.data, null, 2)}</pre>}
              <button
                className="btn btn-secondary"
                onClick={() =>
                  navigator.clipboard
                    .writeText(detail)
                    .then(() => setNotice('已复制日志详情'))
                    .catch(() => setActionError('复制失败，请选择文本复制'))
                }
              >
                <Copy size={16} />
                复制详情
              </button>
            </aside>
          )}
        </div>
        <footer className="logs-footer">
          <label>
            导出范围
            <select
              aria-label="导出范围"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
            >
              <option value="all">全部保留日志</option>
              <option value="filtered">当前筛选结果</option>
            </select>
          </label>
          <label>
            格式
            <select
              aria-label="导出格式"
              value={format}
              onChange={(event) => setFormat(event.target.value as 'text' | 'json')}
            >
              <option value="text">可读文本 LOG</option>
              <option value="json">结构化 JSON</option>
            </select>
          </label>
          <button
            className="btn btn-secondary"
            disabled={exporting || ((!hasFilter || scope === 'filtered') && !logs.length && !total)}
            onClick={() => void handleExport()}
          >
            <Download size={16} />
            {exporting ? '正在导出…' : '导出日志'}
          </button>
          <button
            className="btn btn-danger logs-clear"
            disabled={loading || (!hasFilter && !logs.length && !total)}
            onClick={() => {
              setSelected(null);
              void clearLogs().catch((err) =>
                setActionError(err instanceof Error ? err.message : '日志清空失败')
              );
            }}
          >
            <Trash2 size={16} />
            清除日志
          </button>
        </footer>
      </section>
    </div>
  );
};
export type DisplayLogEntry = LogEntry;
