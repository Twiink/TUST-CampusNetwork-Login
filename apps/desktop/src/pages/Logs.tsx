import React from 'react';
import { useApp } from '../context/AppContext';

export const Logs: React.FC = () => {
  const { logs, clearLogs } = useApp();

  return (
    <div className="logs-page-container" style={{ 
      height: 'calc(100vh - 96px)', // 100vh minus parent padding (48px * 2)
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <h2 className="page-title" style={{ marginBottom: '24px' }}>运行日志</h2>
      <div className="card logs-card" style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden',
        padding: 0, // Remove card padding to handle it in internal sections
        margin: 0
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          padding: '24px 32px',
          borderBottom: '1px solid rgba(14, 165, 233, 0.1)'
        }}>
          <h3 style={{ margin: 0, border: 'none', padding: 0 }}>系统实时日志</h3>
          <button 
            onClick={clearLogs}
            className="btn btn-danger" 
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            清除日志
          </button>
        </div>
        <div className="logs-content" style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '24px 32px',
          backgroundColor: 'rgba(0, 0, 0, 0.02)',
          fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace'
        }}>
          {logs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {logs.map((log) => (
                <div key={log.id} className="log-entry" style={{ 
                  marginBottom: '10px', 
                  fontSize: '0.9rem',
                  lineHeight: '1.4',
                  display: 'flex',
                  gap: '12px'
                }}>
                  <span className="log-timestamp" style={{ color: '#64748b', whiteSpace: 'nowrap' }}>[{log.timestamp}]</span>
                  <span className={`log-level`} style={{ 
                    fontWeight: 'bold',
                    minWidth: '70px',
                    color: log.level === 'error' ? '#f87171' : 
                           log.level === 'warn' ? '#fbbf24' : 
                           log.level === 'success' ? '#4ade80' : '#60a5fa'
                  }}>
                    [{log.level.toUpperCase()}]
                  </span>
                  <span className="log-message" style={{ color: '#334155' }}>{log.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: '4rem' }}>
              暂无日志记录
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
