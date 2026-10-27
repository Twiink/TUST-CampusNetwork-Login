import React, { useState, useMemo } from 'react';
import type { LogEntry } from '@repo/shared';
import { useLogs } from '../hooks/useLogs';
import { VirtualLogList } from '../components/logs/VirtualLogList';
import {
  FileText,
  Trash2,
  Filter,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Bug,
  Download,
  FolderOpen,
} from 'lucide-react';

type LogLevel = 'all' | 'info' | 'success' | 'warn' | 'error' | 'debug';

const LOG_LEVEL_OPTIONS: {
  value: LogLevel;
  label: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  { value: 'all', label: '全部', icon: <Filter size={14} />, color: '#64748b' },
  { value: 'info', label: '信息', icon: <Info size={14} />, color: '#3b82f6' }, // Blue
  { value: 'success', label: '成功', icon: <CheckCircle2 size={14} />, color: '#22c55e' }, // Green
  { value: 'warn', label: '警告', icon: <AlertTriangle size={14} />, color: '#f59e0b' }, // Yellow
  { value: 'error', label: '错误', icon: <XCircle size={14} />, color: '#ef4444' }, // Red
  { value: 'debug', label: '调试', icon: <Bug size={14} />, color: '#a855f7' }, // Purple
];

export const Logs: React.FC = () => {
  const { logs, clearLogs } = useLogs();
  const [filterLevel, setFilterLevel] = useState<LogLevel>('all');
  const [exporting, setExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredLogs = useMemo(() => {
    if (filterLevel === 'all') return logs;
    return logs.filter((log) => log.level === filterLevel);
  }, [logs, filterLevel]);

  const handleExport = async (format: 'text' | 'json') => {
    setExporting(true);
    setActionError(null);
    try {
      const result = await window.electronAPI.log.exportSave(format);
      if (!result.success) {
        setActionError(result.error || '导出日志失败');
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '导出日志失败');
    } finally {
      setExporting(false);
    }
  };

  const handleOpenLogDir = async () => {
    setActionError(null);
    try {
      const result = await window.electronAPI.log.openDir();
      if (!result.success) {
        setActionError(result.error || '打开日志目录失败');
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '打开日志目录失败');
    }
  };

  const handleClearLogs = async () => {
    setActionError(null);
    try {
      await clearLogs();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '清除日志失败');
    }
  };

  return (
    <div
      className="logs-page-container"
      style={{
        height: 'calc(100vh - 96px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <h2
        className="page-title"
        style={{ marginBottom: '24px', display: 'flex', alignItems: 'center' }}
      >
        <FileText size={24} style={{ marginRight: 8 }} />
        运行日志
      </h2>
      <div
        className="card logs-card"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: 0,
          margin: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-color)',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Filter size={16} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>筛选级别:</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {LOG_LEVEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilterLevel(opt.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    border: '1px solid',
                    borderColor: filterLevel === opt.value ? opt.color : `${opt.color}40`,
                    borderRadius: '16px',
                    backgroundColor:
                      filterLevel === opt.value ? `${opt.color}20` : 'rgba(255, 255, 255, 0.1)',
                    color: filterLevel === opt.value ? opt.color : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: filterLevel === opt.value ? 600 : 400,
                    transition: 'all 0.2s ease',
                    backdropFilter: 'blur(4px)',
                    outline: 'none',
                    boxShadow: filterLevel === opt.value ? `0 0 0 2px ${opt.color}30` : 'none',
                  }}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              共 {filteredLogs.length} 条{filterLevel !== 'all' && ` (筛选自 ${logs.length} 条)`}
            </span>
            <button
              onClick={handleOpenLogDir}
              className="btn btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              title="在文件管理器中打开日志目录"
            >
              <FolderOpen size={14} />
              日志目录
            </button>
            <button
              onClick={() => handleExport('text')}
              disabled={exporting || logs.length === 0}
              className="btn btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                opacity: exporting || logs.length === 0 ? 0.5 : 1,
              }}
            >
              <Download size={14} />
              导出 LOG
            </button>
            <button
              onClick={() => handleExport('json')}
              disabled={exporting || logs.length === 0}
              className="btn btn-secondary"
              style={{
                padding: '6px 12px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                opacity: exporting || logs.length === 0 ? 0.5 : 1,
              }}
            >
              <Download size={14} />
              导出 JSON
            </button>
            <button
              onClick={() => void handleClearLogs()}
              className="btn btn-danger"
              disabled={logs.length === 0}
              style={{
                padding: '6px 12px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                opacity: logs.length === 0 ? 0.5 : 1,
              }}
            >
              <Trash2 size={14} />
              清除日志
            </button>
          </div>
        </div>
        {actionError && (
          <div
            role="alert"
            style={{
              margin: '12px 24px 0',
              padding: '10px 12px',
              color: 'var(--error-color)',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {actionError}
          </div>
        )}
        <div
          className="logs-content"
          style={{
            flex: 1,
            minHeight: 0,
            padding: '16px 24px',
          }}
        >
          {filteredLogs.length > 0 ? (
            <VirtualLogList logs={filteredLogs} />
          ) : (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '4rem' }}>
              {filterLevel === 'all'
                ? '暂无日志记录'
                : `暂无 ${LOG_LEVEL_OPTIONS.find((o) => o.value === filterLevel)?.label} 级别的日志`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export type DisplayLogEntry = LogEntry;
