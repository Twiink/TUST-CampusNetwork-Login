import React from 'react';
import type { NetworkStatus } from '@repo/shared';
import { RefreshCw, Wifi } from 'lucide-react';
import { WifiMetricGrid } from './WifiMetricGrid';
import { WifiDetailGrid } from './WifiDetailGrid';

// WiFi 信息卡片组件
export const WifiInfoCard: React.FC<{
  networkStatus: NetworkStatus;
  onRefresh: () => void;
  refreshing: boolean;
}> = ({ networkStatus, onRefresh, refreshing }) => {
  const { ssid } = networkStatus;

  return (
    <div
      style={{
        backgroundColor: 'rgba(14, 165, 233, 0.05)',
        borderRadius: 'var(--radius-md)',
        padding: 16,
        marginBottom: 16,
        position: 'relative',
      }}
    >
      {/* 刷新按钮 */}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'transparent',
          border: 'none',
          cursor: refreshing ? 'not-allowed' : 'pointer',
          padding: 4,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          opacity: refreshing ? 0.5 : 1,
        }}
        onMouseEnter={(e) => {
          if (!refreshing) {
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        title="刷新 WiFi 信息"
      >
        <RefreshCw
          size={18}
          color="var(--primary-color)"
          style={{
            animation: refreshing ? 'spin 1s linear infinite' : 'none',
          }}
        />
      </button>

      {/* WiFi 名称 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          paddingRight: 30,
        }}
      >
        <Wifi size={18} color="var(--primary-color)" />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>WiFi 名称:</span>
        <strong style={{ color: 'var(--text-primary)', fontSize: '1.1rem' }}>{ssid}</strong>
      </div>

      <WifiMetricGrid networkStatus={networkStatus} />
      <WifiDetailGrid networkStatus={networkStatus} />
    </div>
  );
};
