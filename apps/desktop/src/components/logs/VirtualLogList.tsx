import React, { useEffect, useRef, useState } from 'react';
import { LOG_LEVEL_LABELS, type LogEntry } from '@repo/shared';

const ROW_HEIGHT = 62;
export const VirtualLogList: React.FC<{
  logs: LogEntry[]; selectedId?: string; onSelect: (entry: LogEntry) => void; onFollowing: (following: boolean) => void; resetKey?: number;
}> = ({ logs, selectedId, onSelect, onFollowing, resetKey }) => {
  const container = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(480);
  const [top, setTop] = useState(0);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (container.current) container.current.scrollTop = 0; setTop(0); }, [resetKey]);
  const start = Math.max(0, Math.floor(top / ROW_HEIGHT) - 6);
  const end = Math.min(logs.length, start + Math.ceil(height / ROW_HEIGHT) + 12);
  return <div className="log-virtual-list" ref={container} role="region" aria-label="日志列表" onScroll={event => {
    setTop(event.currentTarget.scrollTop); onFollowing(event.currentTarget.scrollTop < 10);
  }}>
    <div style={{ height: logs.length * ROW_HEIGHT, position: 'relative' }}>
      {logs.slice(start, end).map((entry, index) => <button key={entry.id} className={`log-row ${selectedId === entry.id ? 'is-selected' : ''}`} style={{ top: (start + index) * ROW_HEIGHT, height: ROW_HEIGHT }} onClick={() => onSelect(entry)} aria-pressed={selectedId === entry.id}>
        <span className="log-row-meta"><time dateTime={new Date(entry.timestamp).toISOString()}>{new Date(entry.timestamp).toLocaleString()}</time><span className={`log-level level-${entry.level}`}>{LOG_LEVEL_LABELS[entry.level]}</span><span className="log-source">{entry.source ?? entry.category ?? '应用'}</span></span>
        <span className="log-summary">{entry.message}</span>
      </button>)}
    </div>
  </div>;
};
