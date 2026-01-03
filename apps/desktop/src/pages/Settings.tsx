import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import type { AccountConfig, WifiConfig, ISP } from '@repo/shared';
import {
  Settings as SettingsIcon,
  User,
  Wifi,
  Plus,
  Trash2,
  Check,
  Heart,
  RefreshCw,
  Bell,
  Rocket,
  Server,
  Lock,
  Globe,
  RotateCcw,
  Link,
} from 'lucide-react';

const ISP_OPTIONS: { value: ISP; label: string }[] = [
  { value: 'campus', label: '校园网' },
  { value: 'cmcc', label: '中国移动' },
  { value: 'cucc', label: '中国联通' },
  { value: 'ctcc', label: '中国电信' },
];

export const Settings: React.FC = () => {
  const { config, setConfig } = useApp();
  const [newAccount, setNewAccount] = useState<{
    username: string;
    password: string;
    serverUrl: string;
    isp: ISP;
  }>({
    username: '',
    password: '',
    serverUrl: 'http://10.10.102.50:801',
    isp: 'campus',
  });

  const [newWifi, setNewWifi] = useState<{
    ssid: string;
    password: string;
    requiresAuth: boolean;
    linkedAccountId: string;
  }>({
    ssid: '',
    password: '',
    requiresAuth: true,
    linkedAccountId: '',
  });

  const handleAddAccount = () => {
    if (!newAccount.username || !newAccount.password || !config) return;
    const account: AccountConfig = {
      id: Date.now().toString(),
      name: newAccount.username,
      username: newAccount.username,
      password: newAccount.password,
      serverUrl: newAccount.serverUrl,
      isp: newAccount.isp,
    };

    setConfig({
      ...config,
      accounts: [...config.accounts, account],
      currentAccountId: config.currentAccountId || account.id,
    });
    setNewAccount({
      username: '',
      password: '',
      serverUrl: 'http://10.10.102.50:801',
      isp: 'campus',
    });
  };

  const handleRemoveAccount = (id: string) => {
    if (!config) return;
    const updatedAccounts = config.accounts.filter((a) => a.id !== id);
    // 同时更新引用了该账号的 WiFi 配置
    const updatedWifiList = config.wifiList.map((wifi) => {
      if (wifi.linkedAccountId === id) {
        return { ...wifi, linkedAccountId: undefined };
      }
      return wifi;
    });
    setConfig({
      ...config,
      accounts: updatedAccounts,
      wifiList: updatedWifiList,
      currentAccountId:
        config.currentAccountId === id
          ? updatedAccounts.length > 0
            ? updatedAccounts[0].id
            : null
          : config.currentAccountId,
    });
  };

  const handleAddWifi = () => {
    if (!newWifi.ssid || !config) return;
    // 如果需要认证但没选择账号，提示用户
    if (newWifi.requiresAuth && !newWifi.linkedAccountId) {
      alert('需要认证的 WiFi 必须选择关联账号');
      return;
    }
    const wifi: WifiConfig = {
      id: Date.now().toString(),
      ssid: newWifi.ssid,
      password: newWifi.password,
      autoConnect: true,
      requiresAuth: newWifi.requiresAuth,
      linkedAccountId: newWifi.requiresAuth ? newWifi.linkedAccountId : undefined,
      priority: config.wifiList.length,
    };

    setConfig({
      ...config,
      wifiList: [...config.wifiList, wifi],
    });
    setNewWifi({ ssid: '', password: '', requiresAuth: true, linkedAccountId: '' });
  };

  const handleRemoveWifi = (id: string) => {
    if (!config) return;
    setConfig({
      ...config,
      wifiList: config.wifiList.filter((w) => w.id !== id),
    });
  };

  const handleSettingChange = (key: string, value: unknown) => {
    if (!config) return;
    setConfig({
      ...config,
      settings: { ...config.settings, [key]: value },
    });
  };

  const getISPLabel = (isp: ISP) => {
    return ISP_OPTIONS.find((opt) => opt.value === isp)?.label || isp;
  };

  const getLinkedAccount = (accountId?: string) => {
    if (!accountId || !config) return null;
    return config.accounts.find((acc) => acc.id === accountId);
  };

  return (
    <div className="page-settings">
      <h1 className="page-title">
        <SettingsIcon size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
        配置设置
      </h1>

      {!config ? (
        <div className="card">
          <p>加载中...</p>
        </div>
      ) : (
        <>
          {/* 通用设置 */}
          <div className="card">
            <h3>
              <SettingsIcon size={18} style={{ marginRight: 8 }} />
              通用设置
            </h3>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ marginRight: 10, width: 18, height: 18 }}
                  checked={config.settings.autoLaunch}
                  onChange={(e) => handleSettingChange('autoLaunch', e.target.checked)}
                />
                <Rocket size={16} style={{ marginRight: 6 }} /> 开机自动启动
              </label>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ marginRight: 10, width: 18, height: 18 }}
                  checked={config.settings.enableHeartbeat}
                  onChange={(e) => handleSettingChange('enableHeartbeat', e.target.checked)}
                />
                <Heart
                  size={16}
                  style={{
                    marginRight: 6,
                    color: config.settings.enableHeartbeat ? '#ef4444' : 'inherit',
                  }}
                />{' '}
                启用心跳检测
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 8 }}>
                  (开启后自动检测网络连接状态)
                </span>
              </label>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ marginRight: 10, width: 18, height: 18 }}
                  checked={config.settings.autoReconnect}
                  onChange={(e) => handleSettingChange('autoReconnect', e.target.checked)}
                />
                <RefreshCw size={16} style={{ marginRight: 6 }} /> 断线自动重连
              </label>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ marginRight: 10, width: 18, height: 18 }}
                  checked={config.settings.showNotification}
                  onChange={(e) => handleSettingChange('showNotification', e.target.checked)}
                />
                <Bell size={16} style={{ marginRight: 6 }} /> 显示通知
              </label>
            </div>
            {config.settings.enableHeartbeat && (
              <div
                className="form-group"
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: '1px solid var(--border-color)',
                }}
              >
                <label>
                  <Heart size={14} style={{ marginRight: 6 }} />
                  心跳检测间隔 (秒)
                </label>
                <input
                  type="number"
                  className="form-control"
                  value={config.settings.pollingInterval}
                  min={5}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) =>
                    handleSettingChange('pollingInterval', parseInt(e.target.value) || 30)
                  }
                />
              </div>
            )}
            <div className="form-group">
              <label>
                <RotateCcw size={14} style={{ marginRight: 6 }} />
                最大重试次数
              </label>
              <input
                type="number"
                className="form-control"
                value={config.settings.maxRetries}
                min={0}
                max={10}
                onWheel={(e) => e.currentTarget.blur()}
                onChange={(e) => handleSettingChange('maxRetries', parseInt(e.target.value) || 3)}
              />
            </div>
          </div>

          {/* 账号管理 */}
          <div className="card">
            <h3>
              <User size={18} style={{ marginRight: 8 }} />
              账号管理
            </h3>
            <div style={{ marginBottom: 20 }}>
              {config.accounts.length === 0 ? (
                <div
                  style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    backgroundColor: 'rgba(0,0,0,0.02)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <User size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <p style={{ margin: 0 }}>暂无账号，请添加账号以使用登录功能</p>
                </div>
              ) : (
                config.accounts.map((acc) => (
                  <div
                    key={acc.id}
                    style={{
                      padding: '12px 0',
                      borderBottom: '1px solid rgba(0,0,0,0.05)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                        <User size={14} style={{ marginRight: 6 }} />
                        {acc.username}
                        <span
                          style={{
                            fontSize: '0.8rem',
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
                          fontSize: '0.85rem',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          marginTop: 4,
                        }}
                      >
                        <Server size={12} style={{ marginRight: 4 }} />
                        {acc.serverUrl}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className={`btn ${config.currentAccountId === acc.id ? 'btn-primary' : ''}`}
                        style={{ padding: '6px 16px', fontSize: '14px', height: 'auto' }}
                        onClick={() => setConfig({ ...config, currentAccountId: acc.id })}
                        disabled={config.currentAccountId === acc.id}
                      >
                        {config.currentAccountId === acc.id ? (
                          <>
                            <Check size={14} style={{ marginRight: 4 }} />
                            使用中
                          </>
                        ) : (
                          '使用此账号'
                        )}
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ padding: '6px 12px', fontSize: '14px', height: 'auto' }}
                        onClick={() => handleRemoveAccount(acc.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <h4 style={{ marginBottom: 16, display: 'flex', alignItems: 'center' }}>
              <Plus size={16} style={{ marginRight: 6 }} />
              添加新账号
            </h4>
            <div className="form-group">
              <label>
                <User size={14} style={{ marginRight: 6 }} />
                用户名
              </label>
              <input
                className="form-control"
                placeholder="请输入学号/用户名"
                value={newAccount.username}
                onChange={(e) => setNewAccount({ ...newAccount, username: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>
                <Lock size={14} style={{ marginRight: 6 }} />
                密码
              </label>
              <input
                type="password"
                className="form-control"
                placeholder="请输入密码"
                value={newAccount.password}
                onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>
                <Globe size={14} style={{ marginRight: 6 }} />
                服务商
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                {ISP_OPTIONS.map((opt) => (
                  <div
                    key={opt.value}
                    onClick={() => setNewAccount({ ...newAccount, isp: opt.value })}
                    style={{
                      padding: '12px',
                      textAlign: 'center',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid',
                      borderColor:
                        newAccount.isp === opt.value
                          ? 'var(--primary-color)'
                          : 'var(--border-color)',
                      background:
                        newAccount.isp === opt.value
                          ? 'rgba(14, 165, 233, 0.1)'
                          : 'rgba(255, 255, 255, 0.4)',
                      color:
                        newAccount.isp === opt.value ? 'var(--primary-color)' : 'var(--text-color)',
                      cursor: 'pointer',
                      fontWeight: newAccount.isp === opt.value ? '600' : '500',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>
                <Server size={14} style={{ marginRight: 6 }} />
                登录服务器地址
              </label>
              <input
                className="form-control"
                value={newAccount.serverUrl}
                onChange={(e) => setNewAccount({ ...newAccount, serverUrl: e.target.value })}
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={handleAddAccount}
            >
              <Plus size={16} style={{ marginRight: 6 }} />
              保存并添加账号
            </button>
          </div>

          {/* WiFi 配置 */}
          <div className="card">
            <h3>
              <Wifi size={18} style={{ marginRight: 8 }} />
              WiFi 配置
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
              配置需要自动连接的 WiFi 网络。启用心跳检测后，断线时会按优先级尝试切换网络。
            </p>

            <div style={{ marginBottom: 20 }}>
              {config.wifiList.length === 0 ? (
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
                config.wifiList.map((wifi, index) => {
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
                              backgroundColor: '#f3f4f6',
                              color: '#6b7280',
                              padding: '2px 8px',
                              borderRadius: '12px',
                            }}
                          >
                            优先级 {index + 1}
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
                      <button
                        className="btn btn-danger"
                        style={{ padding: '6px 12px', fontSize: '14px', height: 'auto' }}
                        onClick={() => handleRemoveWifi(wifi.id)}
                      >
                        <Trash2 size={14} />
                      </button>
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
            {newWifi.requiresAuth && (
              <div className="form-group">
                <label>
                  <Link size={14} style={{ marginRight: 6 }} />
                  关联账号
                </label>
                {config.accounts.length === 0 ? (
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
                    {config.accounts.map((acc) => (
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
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={handleAddWifi}
              disabled={newWifi.requiresAuth && config.accounts.length === 0}
            >
              <Plus size={16} style={{ marginRight: 6 }} />
              添加 WiFi
            </button>
          </div>
        </>
      )}
    </div>
  );
};
