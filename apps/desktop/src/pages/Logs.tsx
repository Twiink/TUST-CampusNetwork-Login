import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  FileText,
  Trash2,
  Filter,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Bug,
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
  const { logs, clearLogs } = useApp();
  const [filterLevel, setFilterLevel] = useState<LogLevel>('all');

  const filteredLogs = useMemo(() => {
    if (filterLevel === 'all') return logs;
    return logs.filter((log) => log.level === filterLevel);
  }, [logs, filterLevel]);

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'info':
        return <Info size={14} />;
      case 'success':
        return <CheckCircle2 size={14} />;
      case 'warn':
        return <AlertTriangle size={14} />;
      case 'error':
        return <XCircle size={14} />;
      case 'debug':
        return <Bug size={14} />;
      default:
        return <Info size={14} />;
    }
  };

  const getLogColor = (level: string) => {
    const option = LOG_LEVEL_OPTIONS.find((opt) => opt.value === level);
    return option ? option.color : '#3b82f6';
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
              onClick={clearLogs}
              className="btn btn-danger"
              style={{
                padding: '6px 12px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Trash2 size={14} />
              清除日志
            </button>
          </div>
        </div>
        <div
          className="logs-content"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 24px',
            backgroundColor: 'var(--log-container-bg)',
            fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
          }}
        >
          {filteredLogs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="log-entry"
                  style={{
                    marginBottom: '8px',
                    fontSize: '0.85rem',
                    lineHeight: '1.4',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--log-bg)',
                    border: `1px solid ${getLogColor(log.level)}30`, // Use level color for log entry border
                  }}
                >
                  <span
                    className="log-timestamp"
                    style={{
                      color: 'var(--log-timestamp)',
                      whiteSpace: 'nowrap',
                      fontSize: '0.8rem',
                    }}
                  >
                    [{log.timestamp}]
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      minWidth: '70px',
                      color: getLogColor(log.level),
                    }}
                  >
                    {getLogIcon(log.level)}
                    <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                      {log.level.toUpperCase()}
                    </span>
                  </span>
                  <span className="log-message" style={{ color: 'var(--log-message)', flex: 1 }}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
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
