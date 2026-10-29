import React from 'react';
import { useApp } from '../../context/AppContext';
import { Wifi, RefreshCw } from 'lucide-react';
import { matchWifiRule } from '@repo/shared';

// WiFi 切换卡片组件
export const WifiSwitcherCard: React.FC<{
  config: NonNullable<ReturnType<typeof useApp>['config']>;
  currentSsid: string | null;
  onSwitch: (id: string) => Promise<void>;
  switching: boolean;
}> = ({ config, currentSsid, onSwitch, switching }) => {
  // 按优先级排序WiFi列表
  const sortedWifiList = [...config.wifiList].sort(
    (a, b) => (a.priority || 10) - (b.priority || 10)
  );
  const { status } = useApp();
  const currentRule = currentSsid
    ? matchWifiRule(config.wifiList, { ...status, ssid: currentSsid })
    : null;

  // 如果只有一个或没有WiFi配置，不显示切换卡片
  if (sortedWifiList.length === 0) {
    return null;
  }

  return (
    <div className="card">
      <h3>
        <RefreshCw size={18} style={{ marginRight: 8 }} />
        切换 WiFi
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
        点击下方按钮切换到其他已配置的 WiFi 网络
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        {sortedWifiList.map((wifi) => {
          const isCurrent = wifi.id === currentRule?.id;
          const priorityColor = (() => {
            const priority = wifi.priority || 10;
            if (priority <= 3) return '#ef4444';
            if (priority <= 6) return '#f97316';
            if (priority <= 10) return '#3b82f6';
            if (priority <= 20) return '#22c55e';
            return '#6b7280';
          })();

          return (
            <button
              key={wifi.id}
              onClick={() => !isCurrent && !switching && onSwitch(wifi.id)}
              disabled={isCurrent || switching}
              style={{
                padding: 12,
                borderRadius: 'var(--radius-md)',
                border: isCurrent
                  ? '2px solid var(--primary-color)'
                  : '1px solid var(--border-color)',
                background: isCurrent
                  ? 'rgba(14, 165, 233, 0.1)'
                  : switching
                    ? 'rgba(0, 0, 0, 0.02)'
                    : 'rgba(255, 255, 255, 0.4)',
                cursor: isCurrent || switching ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: isCurrent || switching ? 0.7 : 1,
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Wifi
                  size={16}
                  color={isCurrent ? 'var(--primary-color)' : 'var(--text-secondary)'}
                />
                <span
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: isCurrent ? 600 : 500,
                    color: isCurrent ? 'var(--primary-color)' : 'var(--text-primary)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {wifi.ssid}
                </span>
              </div>
              {(wifi.security || wifi.bssid) && (
                <div
                  style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 8 }}
                >
                  {[wifi.security, wifi.bssid].filter(Boolean).join(' · ')}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '0.7rem',
                    backgroundColor: wifi.requiresAuth ? '#fef3c7' : '#d1fae5',
                    color: wifi.requiresAuth ? '#92400e' : '#065f46',
                    padding: '2px 6px',
                    borderRadius: '10px',
                  }}
                >
                  {wifi.requiresAuth ? '校园网认证' : '普通热点'}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    backgroundColor: priorityColor + '20',
                    color: priorityColor,
                    padding: '2px 6px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  优先级 {wifi.priority || 10}
                </span>
                {isCurrent && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      backgroundColor: 'var(--primary-color)',
                      color: 'white',
                      padding: '2px 6px',
                      borderRadius: '10px',
                    }}
                  >
                    当前
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
