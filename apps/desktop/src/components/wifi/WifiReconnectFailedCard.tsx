import React from 'react';
import { useWifiReconnect } from '../../hooks/useWifiReconnect';
import { WifiOff, AlertCircle, XCircle } from 'lucide-react';

// WiFi 重连全部失败卡片组件
export const WifiReconnectFailedCard: React.FC<{
  allFailed: NonNullable<ReturnType<typeof useWifiReconnect>['allFailed']>;
  onClose: () => void;
}> = ({ allFailed, onClose }) => {
  const { failedList } = allFailed;

  // 获取优先级颜色
  const getPriorityColor = (priority: number) => {
    if (priority <= 3) return '#ef4444';
    if (priority <= 6) return '#f97316';
    if (priority <= 10) return '#3b82f6';
    if (priority <= 20) return '#22c55e';
    return '#6b7280';
  };

  return (
    <div
      className="card"
      style={{
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
        border: '2px solid #ef4444',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444' }}>
          <AlertCircle size={20} />
          所有 WiFi 连接失败
        </h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            borderRadius: '50%',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="关闭"
        >
          <XCircle size={18} color="#ef4444" />
        </button>
      </div>

      <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
        已尝试连接所有配置的 WiFi，但均连接失败。请检查以下WiFi的连接状态或手动连接。
      </p>

      <div style={{ display: 'grid', gap: 12 }}>
        {failedList.map((failed, index) => (
          <div
            key={`${failed.ssid}-${index}`}
            style={{
              padding: 12,
              backgroundColor: 'rgba(255, 255, 255, 0.6)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <WifiOff size={16} color="#ef4444" />
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{failed.ssid}</span>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  backgroundColor: getPriorityColor(failed.priority),
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                优先级 {failed.priority}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} color="#f97316" />
              <span style={{ fontSize: '0.85rem', color: '#f97316' }}>{failed.reason}</span>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <AlertCircle size={16} color="#3b82f6" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <p
            style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: 600, color: '#3b82f6' }}
          >
            建议操作
          </p>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
            }}
          >
            <li>检查WiFi密码是否正确</li>
            <li>确认WiFi信号强度是否足够</li>
            <li>尝试手动连接WiFi</li>
            <li>检查路由器是否正常工作</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
