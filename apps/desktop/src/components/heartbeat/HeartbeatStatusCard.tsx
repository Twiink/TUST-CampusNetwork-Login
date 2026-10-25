import React from 'react';
import { Activity, CheckCircle2, WifiOff, XCircle } from 'lucide-react';
import type { HeartbeatState } from '../../hooks/useHeartbeat';
import { getLatencyStatus } from '../../utils/statusDisplay';

/**
 * 心跳状态卡片：检测间隔、网络状态、延迟与检测 URL 列表。
 * WiFi 未连接时显示暂停提示。原 Home 页五个分支的重复区块收敛于此。
 */
export const HeartbeatStatusCard: React.FC<{
  enabled: boolean;
  wifiConnected: boolean;
  heartbeat: HeartbeatState;
  pollingInterval: number;
}> = ({ enabled, wifiConnected, pollingInterval, heartbeat }) => {
  return (
    <>
      {enabled && (
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: wifiConnected
                    ? heartbeat.connected
                      ? '#22c55e'
                      : '#ef4444'
                    : '#9ca3af',
                  marginRight: 8,
                  animation: wifiConnected ? 'pulse 2s infinite' : 'none',
                }}
              />
              心跳检测{!wifiConnected && ' (已暂停)'}
            </span>
            {wifiConnected && heartbeat.remainingSeconds > 0 && (
              <span
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 'normal',
                  color: 'var(--text-secondary)',
                  backgroundColor: 'rgba(14, 165, 233, 0.1)',
                  padding: '4px 12px',
                  borderRadius: '12px',
                }}
              >
                下次检测: {heartbeat.remainingSeconds}s
              </span>
            )}
          </h3>

          {/* WiFi 未连接时显示友好提示 */}
          {!wifiConnected ? (
            <div
              style={{
                padding: 16,
                backgroundColor: 'rgba(156, 163, 175, 0.1)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(156, 163, 175, 0.3)',
                textAlign: 'center',
              }}
            >
              <WifiOff size={48} color="#9ca3af" style={{ marginBottom: 12 }} />
              <p
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: '#6b7280',
                }}
              >
                心跳检测已暂停
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                }}
              >
                当前未连接 WiFi，心跳检测功能暂停。
                <br />
                连接到 WiFi 后将自动恢复检测。
              </p>
            </div>
          ) : (
            <>
              {/* 心跳检测基本信息 */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  {/* 检测间隔 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 10,
                      backgroundColor: 'rgba(14, 165, 233, 0.05)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <Activity size={16} color="var(--primary-color)" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        检测间隔
                      </div>
                      <div
                        style={{
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {pollingInterval} 秒
                      </div>
                    </div>
                  </div>

                  {/* 网络状态 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: 10,
                      backgroundColor: heartbeat.connected
                        ? 'rgba(34, 197, 94, 0.1)'
                        : 'rgba(239, 68, 68, 0.1)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {heartbeat.connected ? (
                      <CheckCircle2 size={16} color="#22c55e" />
                    ) : (
                      <XCircle size={16} color="#ef4444" />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        连接状态
                      </div>
                      <div
                        style={{
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          color: heartbeat.connected ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {heartbeat.connected ? '正常' : '异常'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 延迟信息 */}
                {heartbeat.latency && (
                  <div
                    style={{
                      padding: 12,
                      backgroundColor: 'rgba(14, 165, 233, 0.05)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        网络延迟详情
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        测试目标: {heartbeat.latency.source}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Activity size={16} color={getLatencyStatus(heartbeat.latency.value).color} />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: '1.1rem',
                            fontWeight: 600,
                            color: getLatencyStatus(heartbeat.latency.value).color,
                          }}
                        >
                          {heartbeat.latency.value === 9999
                            ? '超时'
                            : `${heartbeat.latency.value}ms · ${getLatencyStatus(heartbeat.latency.value).text}`}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 检测URL列表 */}
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  padding: 10,
                  backgroundColor: 'rgba(0, 0, 0, 0.02)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ marginBottom: 6, fontWeight: 600 }}>检测服务器:</div>
                <div style={{ lineHeight: 1.6 }}>
                  • https://www.baidu.com (百度)
                  <br />
                  • https://www.speedtest.cn (测速网)
                  <br />• http://connectivitycheck.platform.hicloud.com (华为云)
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};
