import React from 'react';
import type { AccountConfig, WifiConfig } from '@repo/shared';
import { Wifi, RefreshCw, Star, Link, Trash2, Plus, Lock, Server, User } from 'lucide-react';
import { getISPLabel, getPriorityColor, type NewWifiForm } from './shared';

export const WifiConfigCard: React.FC<{
  wifiList: WifiConfig[];
  accounts: AccountConfig[];
  newWifi: NewWifiForm;
  setNewWifi: React.Dispatch<React.SetStateAction<NewWifiForm>>;
  onAddWifi: () => void;
  onRemoveWifi: (id: string) => void;
  onToggleAutoConnect: (id: string) => void;
}> = ({
  wifiList,
  accounts,
  newWifi,
  setNewWifi,
  onAddWifi,
  onRemoveWifi,
  onToggleAutoConnect,
}) => {
  const getLinkedAccount = (accountId?: string) => {
    if (!accountId) return null;
    return accounts.find((acc) => acc.id === accountId) ?? null;
  };

  return (
    <div className="card">
      <h3>
        <Wifi size={18} style={{ marginRight: 8 }} />
        WiFi 配置
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
        配置WiFi网络及其连接选项。新添加的WiFi默认启用自动重连，WiFi断开后会自动尝试重新连接。 点击{' '}
        <RefreshCw size={12} style={{ verticalAlign: 'middle', display: 'inline' }} />{' '}
        按钮可切换自动重连状态。
      </p>

      <div style={{ marginBottom: 20 }}>
        {wifiList.length === 0 ? (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              backgroundColor: 'rgba(0,0,0,0.02)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Wifi size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
            <p style={{ margin: 0 }}>暂无 WiFi 配置</p>
          </div>
        ) : (
          wifiList.map((wifi) => {
            const linkedAccount = getLinkedAccount(wifi.linkedAccountId);
            return (
              <div
                key={wifi.id}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 4,
                    }}
                  >
                    <Wifi size={14} style={{ marginRight: 6 }} />
                    {wifi.ssid}
                    <span
                      style={{
                        fontSize: '0.75rem',
                        backgroundColor: wifi.requiresAuth ? '#fef3c7' : '#d1fae5',
                        color: wifi.requiresAuth ? '#92400e' : '#065f46',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        marginLeft: '4px',
                      }}
                    >
                      {wifi.requiresAuth ? '需要认证' : '无需认证'}
                    </span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        backgroundColor: getPriorityColor(wifi.priority || 10) + '20',
                        color: getPriorityColor(wifi.priority || 10),
                        padding: '2px 8px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Star size={12} />
                      优先级 {wifi.priority || 10}
                    </span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        backgroundColor: wifi.autoConnect ? '#dbeafe' : '#f3f4f6',
                        color: wifi.autoConnect ? '#1e40af' : '#6b7280',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <RefreshCw size={12} />
                      {wifi.autoConnect ? '自动重连' : '手动连接'}
                    </span>
                  </div>
                  {wifi.requiresAuth && linkedAccount && (
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        marginTop: 4,
                      }}
                    >
                      <Link size={12} style={{ marginRight: 4 }} />
                      关联账号: {linkedAccount.username}
                      <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#0369a1' }}>
                        ({getISPLabel(linkedAccount.isp)} - {linkedAccount.serverUrl})
                      </span>
                    </div>
                  )}
                  {wifi.requiresAuth && !linkedAccount && (
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        marginTop: 4,
                      }}
                    >
                      <Link size={12} style={{ marginRight: 4 }} />
                      未关联账号（账号可能已删除）
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn"
                    style={{
                      padding: '6px 12px',
                      fontSize: '14px',
                      height: 'auto',
                      backgroundColor: wifi.autoConnect ? '#dbeafe' : '#f3f4f6',
                      color: wifi.autoConnect ? '#1e40af' : '#6b7280',
                      border: wifi.autoConnect ? '1px solid #93c5fd' : '1px solid #d1d5db',
                    }}
                    onClick={() => onToggleAutoConnect(wifi.id)}
                    title={wifi.autoConnect ? '点击禁用WiFi自动重连' : '点击启用WiFi自动重连'}
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ padding: '6px 12px', fontSize: '14px', height: 'auto' }}
                    onClick={() => onRemoveWifi(wifi.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <h4 style={{ marginBottom: 16, display: 'flex', alignItems: 'center' }}>
        <Plus size={16} style={{ marginRight: 6 }} />
        添加 WiFi
      </h4>
      <div className="form-group">
        <label>
          <Wifi size={14} style={{ marginRight: 6 }} />
          WiFi 名称 (SSID)
        </label>
        <input
          className="form-control"
          placeholder="请输入 WiFi 名称"
          value={newWifi.ssid}
          onChange={(e) => setNewWifi({ ...newWifi, ssid: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label>
          <Lock size={14} style={{ marginRight: 6 }} />
          WiFi 密码
        </label>
        <input
          type="password"
          className="form-control"
          placeholder="请输入 WiFi 密码（可选）"
          value={newWifi.password}
          onChange={(e) => setNewWifi({ ...newWifi, password: e.target.value })}
        />
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            style={{ marginRight: 10, width: 18, height: 18 }}
            checked={newWifi.requiresAuth}
            onChange={(e) =>
              setNewWifi({ ...newWifi, requiresAuth: e.target.checked, linkedAccountId: '' })
            }
          />
          <Server size={16} style={{ marginRight: 6 }} /> 需要校园网认证
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 8 }}>
            (关闭则视为家庭/热点网络)
          </span>
        </label>
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            style={{ marginRight: 10, width: 18, height: 18 }}
            checked={newWifi.autoConnect}
            onChange={(e) => setNewWifi({ ...newWifi, autoConnect: e.target.checked })}
          />
          <RefreshCw size={16} style={{ marginRight: 6 }} /> 断开后自动重连
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 8 }}>
            (关闭后需手动连接此 WiFi)
          </span>
        </label>
      </div>
      {newWifi.requiresAuth && (
        <div className="form-group">
          <label>
            <Link size={14} style={{ marginRight: 6 }} />
            关联账号
          </label>
          {accounts.length === 0 ? (
            <div
              style={{
                padding: '12px',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: '#92400e',
                fontSize: '0.9rem',
              }}
            >
              请先在上方「账号管理」添加账号
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  onClick={() => setNewWifi({ ...newWifi, linkedAccountId: acc.id })}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid',
                    borderColor:
                      newWifi.linkedAccountId === acc.id
                        ? 'var(--primary-color)'
                        : 'var(--border-color)',
                    background:
                      newWifi.linkedAccountId === acc.id
                        ? 'rgba(14, 165, 233, 0.1)'
                        : 'rgba(255, 255, 255, 0.4)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      color:
                        newWifi.linkedAccountId === acc.id
                          ? 'var(--primary-color)'
                          : 'var(--text-color)',
                      fontWeight: newWifi.linkedAccountId === acc.id ? '600' : '500',
                    }}
                  >
                    <User size={14} style={{ marginRight: 6 }} />
                    {acc.username}
                    <span
                      style={{
                        fontSize: '0.75rem',
                        backgroundColor: '#e0f2fe',
                        color: '#0369a1',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        marginLeft: '8px',
                      }}
                    >
                      {getISPLabel(acc.isp)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      marginTop: 4,
                      marginLeft: 20,
                    }}
                  >
                    {acc.serverUrl}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 优先级配置 */}
      <div className="form-group">
        <label>
          <Star size={14} style={{ marginRight: 6 }} />
          优先级
        </label>
        <input
          type="number"
          className="form-control"
          placeholder="请输入优先级（1-99，数字越小优先级越高）"
          value={newWifi.priority || 10}
          min={1}
          max={99}
          onWheel={(e) => e.currentTarget.blur()}
          onChange={(e) => {
            const value = parseInt(e.target.value) || 10;
            setNewWifi({ ...newWifi, priority: Math.min(99, Math.max(1, value)) });
          }}
        />
        <div
          style={{
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            marginTop: 6,
          }}
        >
          数字越小优先级越高（1=最高，99=最低，默认=10）
        </div>
      </div>

      <button
        className="btn btn-primary"
        style={{ width: '100%' }}
        onClick={onAddWifi}
        disabled={newWifi.requiresAuth && accounts.length === 0}
      >
        <Plus size={16} style={{ marginRight: 6 }} />
        添加 WiFi
      </button>
    </div>
  );
};
