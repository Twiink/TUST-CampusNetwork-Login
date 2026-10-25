/**
 * WiFi 扩展信息网格：IPv6/MAC/网关/DNS/子网/BSSID/信道/安全（自 WifiInfoCard 抽出）。
 */

import React from 'react';
import {
  Globe2,
  Globe,
  MonitorSmartphone,
  Router,
  Cpu,
  Radio,
  Lock,
  Network,
  Server,
} from 'lucide-react';
import type { NetworkStatus } from '@repo/shared';

export const WifiDetailGrid: React.FC<{ networkStatus: NetworkStatus }> = ({ networkStatus }) => {
  return (
    <>
      {/* 扩展信息（如果有） */}
      {(networkStatus.ip || networkStatus.mac || networkStatus.bssid || networkStatus.security) && (
        <div
          style={{
            marginTop: 16,
          }}
        >
          <div
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: 12,
            }}
          >
            网络详情
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
              fontSize: '0.85rem',
            }}
          >
            {networkStatus.ip && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                <Globe2 size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}
                >
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    IPv4 地址
                  </span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {networkStatus.ip}
                  </span>
                </div>
              </div>
            )}
            {networkStatus.ipv6 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                <Globe size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}
                >
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    IPv6 地址
                  </span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={networkStatus.ipv6}
                  >
                    {networkStatus.ipv6}
                  </span>
                </div>
              </div>
            )}
            {networkStatus.mac && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                <MonitorSmartphone
                  size={16}
                  color="var(--primary-color)"
                  style={{ flexShrink: 0 }}
                />
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}
                >
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    MAC 地址
                  </span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {networkStatus.mac}
                  </span>
                </div>
              </div>
            )}
            {networkStatus.gateway && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                <Router size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}
                >
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    默认网关
                  </span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {networkStatus.gateway}
                  </span>
                </div>
              </div>
            )}
            {networkStatus.dns && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                <Server size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}
                >
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    DNS 服务器
                  </span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={networkStatus.dns}
                  >
                    {networkStatus.dns}
                  </span>
                </div>
              </div>
            )}
            {networkStatus.subnetMask && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                <Network size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}
                >
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    子网掩码
                  </span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {networkStatus.subnetMask}
                  </span>
                </div>
              </div>
            )}
            {networkStatus.bssid && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                <Cpu size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}
                >
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>BSSID</span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {networkStatus.bssid}
                  </span>
                </div>
              </div>
            )}
            {networkStatus.channel && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                <Radio size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    WiFi 信道
                  </span>
                  <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                    {networkStatus.channel}
                  </span>
                </div>
              </div>
            )}
            {networkStatus.security && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  backgroundColor: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                }}
              >
                <Lock size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    安全类型
                  </span>
                  <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                    {networkStatus.security}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
