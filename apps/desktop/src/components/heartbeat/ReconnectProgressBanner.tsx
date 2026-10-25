import React from 'react';
import { CheckCircle2, Loader, XCircle } from 'lucide-react';
import type { ReconnectProgress } from '../../hooks/useHeartbeat';

/** 认证重连进度提示条（原 Home 页五处重复区块收敛于此） */
export const ReconnectProgressBanner: React.FC<{ progress: ReconnectProgress }> = ({
  progress,
}) => {
  return (
    <>
      {progress.status !== 'idle' && (
        <div
          className="card"
          style={{
            backgroundColor:
              progress.status === 'success'
                ? 'rgba(34, 197, 94, 0.1)'
                : progress.status === 'failed'
                  ? 'rgba(239, 68, 68, 0.1)'
                  : 'rgba(14, 165, 233, 0.1)',
            borderColor:
              progress.status === 'success'
                ? '#22c55e'
                : progress.status === 'failed'
                  ? '#ef4444'
                  : 'var(--primary-color)',
            borderWidth: 1,
            borderStyle: 'solid',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {progress.status === 'reconnecting' && (
              <Loader
                size={20}
                color="var(--primary-color)"
                style={{ animation: 'spin 1s linear infinite' }}
              />
            )}
            {progress.status === 'success' && <CheckCircle2 size={20} color="#22c55e" />}
            {progress.status === 'failed' && <XCircle size={20} color="#ef4444" />}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: 600,
                  color:
                    progress.status === 'success'
                      ? '#22c55e'
                      : progress.status === 'failed'
                        ? '#ef4444'
                        : 'var(--primary-color)',
                  marginBottom: 4,
                }}
              >
                {progress.message}
              </div>
              {progress.status === 'reconnecting' && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  尝试次数: {progress.currentAttempt}/{progress.maxAttempts}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
