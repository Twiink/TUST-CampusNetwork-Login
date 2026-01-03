import React from 'react';
import { useApp } from '../context/AppContext';
import { useNetwork } from '../hooks/useNetwork';
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
} from 'lucide-react';

export const Home: React.FC = () => {
  const { networkStatus, ipAddress, login, logout, config } = useApp();
  const { wifiConnected, wifiSSID } = useNetwork();

  const currentAccount = config?.accounts.find((a) => a.id === config?.currentAccountId);
  const hasAccounts = config?.accounts && config.accounts.length > 0;

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

  // 未配置账户的状态
  if (!hasAccounts) {
    return (
      <div className="page-home">
        <h1 className="page-title">
          <Globe size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          运行状态
        </h1>

        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <AlertCircle size={64} color="#f59e0b" style={{ marginBottom: 16 }} />
          <h2 style={{ margin: '0 0 8px 0', color: '#f59e0b' }}>未配置账户</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
            请先前往"配置设置"添加校园网账户，才能使用登录功能。
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
              点击左侧菜单的"配置设置"添加账户
            </p>
          </div>
        </div>

        <div className="card">
          <h3>
            <Wifi size={18} style={{ marginRight: 8 }} />
            网络信息
          </h3>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--text-secondary)',
            }}
          >
            <WifiOff size={16} />
            <span>等待配置账户...</span>
          </div>
        </div>
      </div>
    );
  }

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
        {currentAccount ? (
          <div
            style={{
              backgroundColor: 'rgba(14, 165, 233, 0.05)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <User size={16} color="var(--primary-color)" />
              <strong>{currentAccount.username}</strong>
              <span
                style={{
                  fontSize: '0.75rem',
                  backgroundColor: '#e0f2fe',
                  color: '#0369a1',
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                {currentAccount.isp === 'campus'
                  ? '校园网'
                  : currentAccount.isp === 'cmcc'
                    ? '中国移动'
                    : currentAccount.isp === 'cucc'
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
              <span>{currentAccount.serverUrl}</span>
            </div>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderRadius: 'var(--radius-md)',
              padding: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#f59e0b',
            }}
          >
            <AlertCircle size={16} />
            <span>尚未选择账号，请前往"配置设置"选择要使用的账号。</span>
          </div>
        )}
      </div>

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
      `}</style>
    </div>
  );
};
