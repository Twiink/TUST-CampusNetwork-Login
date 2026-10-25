import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { DisplayLogEntry } from '../../pages/Logs';
import { AlertTriangle, Bug, CheckCircle2, Info, XCircle } from 'lucide-react';

const ROW_HEIGHT = 41;
const OVERSCAN = 8;

const LEVEL_COLOR: Record<string, string> = {
  info: '#3b82f6',
  success: '#22c55e',
  warn: '#f59e0b',
  error: '#ef4444',
  debug: '#a855f7',
};

function LevelIcon({ level }: { level: string }) {
  const size = 14;
  if (level === 'success') return <CheckCircle2 size={size} />;
  if (level === 'warn') return <AlertTriangle size={size} />;
  if (level === 'error') return <XCircle size={size} />;
  if (level === 'debug') return <Bug size={size} />;
  return <Info size={size} />;
}

export const VirtualLogList: React.FC<{ logs: DisplayLogEntry[] }> = ({ logs }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(480);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const end = Math.min(logs.length, start + visibleCount);
  const visibleLogs = logs.slice(start, end);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        height: '100%',
        overflowY: 'auto',
        backgroundColor: 'var(--log-container-bg)',
        fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
      }}
    >
      <div style={{ height: logs.length * ROW_HEIGHT, position: 'relative' }}>
        {visibleLogs.map((log, index) => {
          const absoluteIndex = start + index;
          const color = LEVEL_COLOR[log.level] ?? LEVEL_COLOR.info;
          return (
            <div
              key={log.id}
              style={{
                position: 'absolute',
                top: absoluteIndex * ROW_HEIGHT,
                left: 0,
                right: 24,
                height: ROW_HEIGHT - 8,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 6,
                backgroundColor: 'var(--log-bg)',
                border: `1px solid ${color}30`,
                fontSize: '0.85rem',
                lineHeight: '1.4',
              }}
            >
              <span
                style={{
                  color: 'var(--log-timestamp)',
                  whiteSpace: 'nowrap',
                  fontSize: '0.8rem',
                }}
              >
                [
                {log.timestamp instanceof Date
                  ? log.timestamp.toLocaleTimeString()
                  : new Date(log.timestamp).toLocaleTimeString()}
                ]
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 70, color }}>
                <LevelIcon level={log.level} />
                <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                  {log.level.toUpperCase()}
                </span>
              </span>
              <span
                style={{
                  color: 'var(--log-message)',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {log.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
