import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNetwork } from '../hooks/useNetwork';
import type { NetworkStatus } from '@repo/shared';
import {
  Wifi,
  WifiOff,
  Loader,
  User,
  Server,
  Globe,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Settings,
  LogIn,
  LogOut,
  Signal,
  Zap,
  Activity,
  Network,
  RefreshCw,
  Globe2,
  MonitorSmartphone,
  Router,
  Cpu,
  Radio,
  Lock,
} from 'lucide-react';

// 检测是否为深色模式
const isDarkMode = () => {
  return (
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
};

// WiFi 信号强度图标和颜色（支持深色模式）
const getSignalIcon = (strength: number) => {
  const dark = isDarkMode();
  if (strength >= 75)
    return {
      icon: <Signal size={16} />,
      color: dark ? '#34d399' : '#22c55e',
      text: '优秀',
    };
  if (strength >= 50)
    return {
      icon: <Signal size={16} />,
      color: dark ? '#60a5fa' : '#3b82f6',
      text: '良好',
    };
  if (strength >= 25)
    return {
      icon: <Signal size={16} />,
      color: dark ? '#fbbf24' : '#f59e0b',
      text: '一般',
    };
  return {
    icon: <Signal size={16} />,
    color: dark ? '#f87171' : '#ef4444',
    text: '较差',
  };
};

// 延迟等级和颜色（支持深色模式）
const getLatencyStatus = (latency: number) => {
  const dark = isDarkMode();
  if (latency < 50) return { color: dark ? '#34d399' : '#22c55e', text: '优秀' };
  if (latency < 100) return { color: dark ? '#60a5fa' : '#3b82f6', text: '良好' };
  if (latency < 200) return { color: dark ? '#fbbf24' : '#f59e0b', text: '一般' };
  if (latency < 500) return { color: dark ? '#fb923c' : '#f97316', text: '较差' };
  return { color: dark ? '#f87171' : '#ef4444', text: '很差' };
};

// 连接速度等级和颜色（支持深色模式）
const getLinkSpeedStatus = (speed: number) => {
  const dark = isDarkMode();
  if (speed >= 500) return { color: dark ? '#34d399' : '#22c55e', text: '优秀' };
  if (speed >= 200) return { color: dark ? '#60a5fa' : '#3b82f6', text: '良好' };
  if (speed >= 100) return { color: dark ? '#fbbf24' : '#f59e0b', text: '一般' };
  if (speed >= 50) return { color: dark ? '#fb923c' : '#f97316', text: '较差' };
  return { color: dark ? '#f87171' : '#ef4444', text: '很差' };
};

// WiFi 信息卡片组件
const WifiInfoCard: React.FC<{ networkStatus: NetworkStatus; onRefresh: () => void; refreshing: boolean }> = ({
  networkStatus,
  onRefresh,
  refreshing,
}) => {
  const { ssid, signalStrength = 0, latency, linkSpeed = 0, frequency = 0 } = networkStatus;

  const signal = getSignalIcon(signalStrength);
  const latencyValue = latency?.value || 9999;
  const latencySource = latency?.source || '';
  const latencyStatusInfo = getLatencyStatus(latencyValue);
  const linkSpeedStatus = getLinkSpeedStatus(linkSpeed);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingRight: 30 }}>
        <Wifi size={18} color="var(--primary-color)" />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>WiFi 名称:</span>
        <strong style={{ color: 'var(--text-primary)', fontSize: '1.1rem' }}>{ssid}</strong>
      </div>

      {/* 网络指标 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
        }}
      >
        {/* 信号强度 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <div style={{ color: signal.color }}>{signal.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>信号强度</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: signal.color }}>
              {signalStrength}% · {signal.text}
            </div>
          </div>
        </div>

        {/* 网络延迟 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Zap size={16} color={linkSpeedStatus.color} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>连接速度</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: linkSpeedStatus.color }}>
              {linkSpeed} Mbps · {linkSpeedStatus.text}
            </div>
          </div>
        </div>

        {/* 频段 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <Wifi size={16} color="var(--primary-color)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>频段</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {frequency >= 5000 ? '5GHz' : frequency >= 2400 ? '2.4GHz' : '未知'}
            </div>
          </div>
        </div>
      </div>

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
                }}
              >
                <Globe2 size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>IPv4 地址</span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
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
                }}
              >
                <Globe size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>IPv6 地址</span>
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
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
                }}
              >
                <MonitorSmartphone size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>MAC 地址</span>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
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
                }}
              >
                <Router size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>默认网关</span>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
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
                }}
              >
                <Server size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>DNS 服务器</span>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
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
                }}
              >
                <Network size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>子网掩码</span>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
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
                }}
              >
                <Cpu size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>BSSID</span>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
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
                }}
              >
                <Radio size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>WiFi 信道</span>
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
                }}
              >
                <Lock size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>安全类型</span>
                  <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                    {networkStatus.security}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// WiFi 切换卡片组件
const WifiSwitcherCard: React.FC<{
  config: NonNullable<ReturnType<typeof useApp>['config']>;
  currentSsid: string | null;
  onSwitch: (ssid: string) => Promise<void>;
  switching: boolean;
}> = ({ config, currentSsid, onSwitch, switching }) => {
  // 按优先级排序WiFi列表
  const sortedWifiList = [...config.wifiList].sort((a, b) => (a.priority || 10) - (b.priority || 10));

  // 如果只有一个或没有WiFi配置，不显示切换卡片
  if (sortedWifiList.length <= 1) {
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
          const isCurrent = wifi.ssid === currentSsid;
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
              onClick={() => !isCurrent && !switching && onSwitch(wifi.ssid)}
              disabled={isCurrent || switching}
              style={{
                padding: 12,
                borderRadius: 'var(--radius-md)',
                border: isCurrent ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
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
                  {wifi.requiresAuth ? '需认证' : '无需认证'}
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

export const Home: React.FC = () => {
  const { networkStatus, ipAddress, login, logout, config } = useApp();
  const { status: fullNetworkStatus, wifiConnected, wifiSSID, fetchStatus, loading, initialCheckDone } =
    useNetwork();
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [switching, setSwitching] = useState(false);

  // 显示toast提示
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // WiFi切换处理
  const handleWifiSwitch = async (ssid: string) => {
    if (switching) return;

    setSwitching(true);
    try {
      const success = await window.electronAPI.wifi.switch(ssid);
      if (success) {
        showToast(`正在切换到 ${ssid}，请稍候...`, 'success');
        // 等待WiFi连接完成后刷新状态
        setTimeout(async () => {
          await fetchStatus();
        }, 3000);
      } else {
        showToast(`切换到 ${ssid} 失败，请重试`, 'error');
      }
    } catch (error) {
      console.error('WiFi切换失败:', error);
      showToast('WiFi切换失败，请检查网络设置', 'error');
    } finally {
      setTimeout(() => {
        setSwitching(false);
      }, 1000);
    }
  };

  // 手动刷新WiFi信息
  const handleRefresh = async () => {
    const now = Date.now();
    // 防抖：2秒内不允许重复刷新
    if (now - lastRefreshTime < 2000) {
      return;
    }

    setRefreshing(true);
    setLastRefreshTime(now);

    try {
      await fetchStatus();
      showToast('WiFi 信息已更新', 'success');
    } catch (error) {
      console.error('Failed to refresh WiFi info:', error);
      showToast('刷新失败，请重试', 'error');
    } finally {
      // 确保至少显示1秒的加载动画
      setTimeout(() => {
        setRefreshing(false);
      }, 1000);
    }
  };

  const getStatusIcon = () => {
    switch (networkStatus) {
      case 'connected':
        return <CheckCircle2 size={48} color="#22c55e" />;
      case 'connecting':
        return <Loader size={48} color="#3b82f6" className="spin" />;
      default:
        return <XCircle size={48} color="#ef4444" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
        return '已连接';
      case 'disconnected':
        return '未连接';
      case 'connecting':
        return '连接中...';
      default:
        return status;
    }
  };

  const getStatusColor = () => {
    switch (networkStatus) {
      case 'connected':
        return '#22c55e';
      case 'connecting':
        return '#3b82f6';
      default:
        return '#ef4444';
    }
  };

  // 优先级 0：如果还在初始检测或正在加载，显示加载状态
  if (!initialCheckDone || loading) {
    return (
      <div className="page-home">
        <h1 className="page-title">
          <Globe size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          运行状态
        </h1>

        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Loader
            size={64}
            color="var(--primary-color)"
            style={{
              marginBottom: 24,
              animation: 'spin 1s linear infinite',
            }}
          />
          <h2 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
            {!initialCheckDone ? '正在检测 WiFi 连接...' : '正在获取 WiFi 详情...'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {!initialCheckDone ? '请稍候，正在检查网络连接状态' : '正在获取网络配置信息，请稍候'}
          </p>
        </div>
      </div>
    );
  }

  // 第一优先级：检查 WiFi 连接状态（无论是否配置账户）
  if (!wifiConnected) {
    return (
      <div className="page-home">
        <h1 className="page-title">
          <Globe size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          运行状态
        </h1>

        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <WifiOff size={64} color="#ef4444" style={{ marginBottom: 16 }} />
          <h2 style={{ margin: '0 0 8px 0', color: '#ef4444' }}>未连接 WiFi</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
            当前设备未连接到任何 WiFi 网络，请先连接 WiFi。
          </p>
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
              textAlign: 'left',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <AlertCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              连接到 WiFi 后才能使用网络认证功能
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 第二优先级：检查 WiFi 是否在配置列表中
  const wifiConfig = config?.wifiList?.find((w) => w.ssid === wifiSSID);

  if (!wifiConfig) {
    return (
      <div className="page-home">
        <h1 className="page-title">
          <Globe size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          运行状态
        </h1>

        {/* WiFi 基础信息 - 必须显示 */}
        <div className="card">
          <h3>
            <Wifi size={18} style={{ marginRight: 8 }} />
            当前 WiFi
          </h3>
          <WifiInfoCard networkStatus={fullNetworkStatus} onRefresh={handleRefresh} refreshing={refreshing} />
        </div>

        {/* WiFi 切换卡片 */}
        {config && (
          <WifiSwitcherCard
            config={config}
            currentSsid={wifiSSID}
            onSwitch={handleWifiSwitch}
            switching={switching}
          />
        )}

        {/* WiFi 未配置警告 */}
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <AlertCircle size={64} color="#f59e0b" style={{ marginBottom: 16 }} />
          <h2 style={{ margin: '0 0 8px 0', color: '#f59e0b' }}>该 WiFi 未配置</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
            当前连接的 WiFi &quot;{wifiSSID}&quot; 尚未配置，请前往&quot;配置设置&quot;添加此 WiFi 的配置。
          </p>
          <div
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
              textAlign: 'left',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <Settings size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              点击左侧菜单的&quot;配置设置&quot;添加 WiFi 配置
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 第三优先级：检查是否需要认证
  if (!wifiConfig.requiresAuth) {
    return (
      <div className="page-home">
        <h1 className="page-title">
          <Globe size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          运行状态
        </h1>

        {/* WiFi 基础信息 */}
        <div className="card">
          <h3>
            <Wifi size={18} style={{ marginRight: 8 }} />
            当前 WiFi
          </h3>
          <WifiInfoCard networkStatus={fullNetworkStatus} onRefresh={handleRefresh} refreshing={refreshing} />
        </div>

        {/* WiFi 切换卡片 */}
        {config && (
          <WifiSwitcherCard
            config={config}
            currentSsid={wifiSSID}
            onSwitch={handleWifiSwitch}
            switching={switching}
          />
        )}

        {/* 无需认证提示 */}
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <CheckCircle2 size={64} color="#22c55e" style={{ marginBottom: 16 }} />
          <h2 style={{ margin: '0 0 8px 0', color: '#22c55e' }}>无需认证</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
            当前 WiFi 无需校园网认证，可直接使用。
          </p>
          <div
            style={{
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
              textAlign: 'left',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              此 WiFi 已配置为&quot;无需认证&quot;（如家庭 WiFi、手机热点等）
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 第四优先级：检查是否有关联账户
  const linkedAccount = config?.accounts.find((a) => a.id === wifiConfig.linkedAccountId);

  if (!linkedAccount) {
    return (
      <div className="page-home">
        <h1 className="page-title">
          <Globe size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          运行状态
        </h1>

        {/* WiFi 基础信息 */}
        <div className="card">
          <h3>
            <Wifi size={18} style={{ marginRight: 8 }} />
            当前 WiFi
          </h3>
          <WifiInfoCard networkStatus={fullNetworkStatus} onRefresh={handleRefresh} refreshing={refreshing} />
        </div>

        {/* WiFi 切换卡片 */}
        {config && (
          <WifiSwitcherCard
            config={config}
            currentSsid={wifiSSID}
            onSwitch={handleWifiSwitch}
            switching={switching}
          />
        )}

        {/* 未配置账户警告 */}
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <AlertCircle size={64} color="#f59e0b" style={{ marginBottom: 16 }} />
          <h2 style={{ margin: '0 0 8px 0', color: '#f59e0b' }}>未配置账户</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
            该 WiFi 需要校园网认证，但尚未关联账户。请前往&quot;配置设置&quot;添加账户并关联到此 WiFi。
          </p>
          <div
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
              textAlign: 'left',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <Settings size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              点击左侧菜单的&quot;配置设置&quot;添加账户并关联
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 显示完整认证界面
  return (
    <div className="page-home">
      <h1 className="page-title">
        <Globe size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
        运行状态
      </h1>

      {/* 网络状态卡片 */}
      <div className="card">
        <h3>
          <Wifi size={18} style={{ marginRight: 8 }} />
          网络状态
        </h3>

        {/* WiFi 连接信息 */}
        <div
          style={{
            backgroundColor: wifiConnected ? 'rgba(14, 165, 233, 0.05)' : 'rgba(239, 68, 68, 0.05)',
            borderRadius: 'var(--radius-md)',
            padding: 12,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {wifiConnected ? (
            <>
              <Wifi size={16} color="var(--primary-color)" />
              <span style={{ color: 'var(--text-secondary)' }}>当前 WiFi:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{wifiSSID}</strong>
            </>
          ) : (
            <>
              <WifiOff size={16} color="#ef4444" />
              <span style={{ color: '#ef4444' }}>未连接 WiFi</span>
            </>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            padding: '20px 0',
          }}
        >
          {getStatusIcon()}
          <div
            style={{
              marginTop: 16,
              fontSize: '1.5rem',
              fontWeight: 600,
              color: getStatusColor(),
            }}
          >
            {getStatusText(networkStatus)}
          </div>
        </div>

        {networkStatus === 'connected' && (
          <div
            style={{
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={16} color="#22c55e" />
              <span style={{ color: 'var(--text-secondary)' }}>IP 地址:</span>
              <strong style={{ color: '#22c55e' }}>{ipAddress}</strong>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          {networkStatus === 'disconnected' ? (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={login}>
              <LogIn size={16} style={{ marginRight: 6 }} />
              立即连接
            </button>
          ) : networkStatus === 'connected' ? (
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={logout}>
              <LogOut size={16} style={{ marginRight: 6 }} />
              断开连接
            </button>
          ) : (
            <button className="btn btn-primary" style={{ flex: 1 }} disabled>
              <Loader size={16} style={{ marginRight: 6 }} className="spin" />
              正在尝试连接...
            </button>
          )}
        </div>
      </div>

      {/* 当前账号卡片 */}
      <div className="card">
        <h3>
          <User size={18} style={{ marginRight: 8 }} />
          当前账号
        </h3>
        <div
          style={{
            backgroundColor: 'rgba(14, 165, 233, 0.05)',
            borderRadius: 'var(--radius-md)',
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <User size={16} color="var(--primary-color)" />
            <strong>{linkedAccount.username}</strong>
            <span
              style={{
                fontSize: '0.75rem',
                backgroundColor: '#e0f2fe',
                color: '#0369a1',
                padding: '2px 8px',
                borderRadius: '12px',
              }}
            >
              {linkedAccount.isp === 'campus'
                ? '校园网'
                : linkedAccount.isp === 'cmcc'
                  ? '中国移动'
                  : linkedAccount.isp === 'cucc'
                    ? '中国联通'
                    : '中国电信'}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--text-secondary)',
              fontSize: '0.9rem',
            }}
          >
            <Server size={14} />
            <span>{linkedAccount.serverUrl}</span>
          </div>
        </div>
      </div>

      {/* WiFi 切换卡片 */}
      {config && (
        <WifiSwitcherCard
          config={config}
          currentSsid={wifiSSID}
          onSwitch={handleWifiSwitch}
          switching={switching}
        />
      )}

      {/* 心跳状态 */}
      {config?.settings.enableHeartbeat && (
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: networkStatus === 'connected' ? '#22c55e' : '#ef4444',
                marginRight: 8,
                animation: 'pulse 2s infinite',
              }}
            />
            心跳检测
          </h3>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <p style={{ margin: '0 0 8px 0' }}>
              检测间隔: <strong>{config.settings.pollingInterval} 秒</strong>
            </p>
            <p style={{ margin: 0 }}>
              状态:{' '}
              <span style={{ color: networkStatus === 'connected' ? '#22c55e' : '#ef4444' }}>
                {networkStatus === 'connected' ? '正常' : '异常'}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Toast 提示 */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            backgroundColor: toast.type === 'success' ? '#22c55e' : '#ef4444',
            color: 'white',
            padding: '12px 20px',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            animation: 'slideInRight 0.3s ease-out',
            zIndex: 1000,
          }}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertCircle size={18} />
          )}
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{toast.message}</span>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};
