/**
 * 网络指标网格：信号强度 / 网络延迟 / 连接速度 / 频段（自 WifiInfoCard 抽出）。
 */

import React from 'react';
import { Activity, Zap, Wifi, Signal } from 'lucide-react';
import type { NetworkStatus } from '@repo/shared';
import {
  isDarkMode,
  getSignalIcon,
  getLatencyStatus,
  getLinkSpeedStatus,
} from '../../utils/statusDisplay';

const cellStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: 8,
  backgroundColor: 'rgba(255, 255, 255, 0.5)',
  borderRadius: 'var(--radius-sm)',
};

export const WifiMetricGrid: React.FC<{ networkStatus: NetworkStatus }> = ({ networkStatus }) => {
  const { signalStrength = 0, latency, linkSpeed = 0, frequency = 0 } = networkStatus;

  const signal = getSignalIcon(signalStrength);
  const latencyValue = latency?.value || 9999;
  const latencySource = latency?.source || '';
  const latencyStatusInfo = getLatencyStatus(latencyValue);
  const linkSpeedStatus = getLinkSpeedStatus(linkSpeed);
  const bandColor =
    frequency >= 5000
      ? isDarkMode()
        ? '#34d399'
        : '#22c55e'
      : isDarkMode()
        ? '#60a5fa'
        : '#3b82f6';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12,
      }}
    >
      {/* 信号强度 */}
      <div style={cellStyle}>
        <div style={{ color: signal.color }}>{signal.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>信号强度</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: signal.color }}>
            {signalStrength}% · {signal.text}
          </div>
        </div>
      </div>

      {/* 网络延迟 */}
      <div style={cellStyle}>
        <Activity size={16} color={latencyStatusInfo.color} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            网络延迟
            {latencySource && (
              <span style={{ marginLeft: 4, fontSize: '0.7rem', opacity: 0.7 }}>
                ({latencySource})
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: latencyStatusInfo.color }}>
            {latencyValue === 9999 ? '超时' : `${latencyValue}ms · ${latencyStatusInfo.text}`}
          </div>
        </div>
      </div>

      {/* 连接速度 */}
      <div style={cellStyle}>
        <Zap size={16} color={linkSpeedStatus.color} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>连接速度</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: linkSpeedStatus.color }}>
            {linkSpeed} Mbps · {linkSpeedStatus.text}
          </div>
        </div>
      </div>

      {/* 频段 */}
      <div style={cellStyle}>
        <Wifi size={16} color={bandColor} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>频段</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: bandColor }}>
            {frequency >= 5000 ? '5G' : frequency >= 2400 ? '2.4G' : '未知'}
          </div>
        </div>
      </div>
    </div>
  );
};

// Signal 图标经 getSignalIcon 内部使用,避免误删
void Signal;
