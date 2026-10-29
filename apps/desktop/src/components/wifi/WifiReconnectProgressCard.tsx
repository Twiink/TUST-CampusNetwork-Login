import React, { useEffect, useState } from 'react';
import { useWifiReconnect } from '../../hooks/useWifiReconnect';
import { Wifi, Loader, CheckCircle2, XCircle } from 'lucide-react';

// WiFi 重连进度卡片组件
export const WifiReconnectProgressCard: React.FC<{
  progress: NonNullable<ReturnType<typeof useWifiReconnect>['progress']>;
}> = ({ progress }) => {
  const { ssid, attempt, maxAttempts, status } = progress;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!progress.nextRetryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [progress.nextRetryAt]);

  // 根据状态选择颜色和图标
  const getStatusConfig = () => {
    switch (status) {
      case 'authenticating':
      case 'verifying':
      case 'connecting':
        return {
          bgColor: 'rgba(59, 130, 246, 0.1)',
          borderColor: '#3b82f6',
          icon: <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />,
          text:
            status === 'authenticating'
              ? '正在认证'
              : status === 'verifying'
                ? '正在确认联网'
                : '正在连接',
          textColor: '#3b82f6',
        };
      case 'success':
        return {
          bgColor: 'rgba(34, 197, 94, 0.1)',
          borderColor: '#22c55e',
          icon: <CheckCircle2 size={18} />,
          text: '连接成功',
          textColor: '#22c55e',
        };
      case 'cancelled':
      case 'cooldown':
      case 'failed':
        return {
          bgColor: 'rgba(239, 68, 68, 0.1)',
          borderColor: '#ef4444',
          icon: <XCircle size={18} />,
          text:
            status === 'cancelled'
              ? '已取消'
              : status === 'cooldown'
                ? '等待下一轮重连'
                : '连接失败',
          textColor: '#ef4444',
        };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <div
      className="card"
      style={{
        backgroundColor: statusConfig.bgColor,
        border: `2px solid ${statusConfig.borderColor}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {statusConfig.icon}
          WiFi 自动重连
        </h3>
        <span
          style={{
            fontSize: '0.85rem',
            color: statusConfig.textColor,
            fontWeight: 600,
          }}
        >
          {statusConfig.text}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* WiFi名称 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wifi size={16} color={statusConfig.textColor} />
          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {ssid}
          </span>
        </div>

        {progress.reason && <p style={{ margin: 0 }}>{progress.reason}</p>}
        {progress.nextRetryAt && (
          <p style={{ margin: 0 }}>
            剩余 {Math.max(0, Math.ceil((progress.nextRetryAt - now) / 1000))} 秒后重试
          </p>
        )}
        {['cooldown', 'failed', 'cancelled'].includes(status) && (
          <button
            className="btn btn-secondary"
            onClick={() => void window.electronAPI.wifi.retry()}
          >
            立即重试
          </button>
        )}
        {/* 尝试次数 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>尝试进度:</span>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                flex: 1,
                height: 8,
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${(attempt / maxAttempts) * 100}%`,
                  height: '100%',
                  backgroundColor: statusConfig.borderColor,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <span
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: statusConfig.textColor,
                minWidth: 50,
              }}
            >
              {attempt} / {maxAttempts}
            </span>
          </div>
        </div>

        {/* 提示信息 */}
        {status === 'connecting' && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            正在尝试连接到 <strong>{ssid}</strong>，第 {attempt} 次尝试...
          </p>
        )}
        {status === 'success' && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#22c55e' }}>
            成功连接到 <strong>{ssid}</strong>！
          </p>
        )}
        {status === 'failed' && attempt === maxAttempts && (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#ef4444' }}>
            <strong>{ssid}</strong> 已达到最大重试次数，正在尝试下一个WiFi...
          </p>
        )}
      </div>
    </div>
  );
};
