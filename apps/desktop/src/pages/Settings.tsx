import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AccountConfig, WifiConfig, ISP } from '@repo/shared';

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
    isp: 'campus'
  });

  const handleAddAccount = () => {
    if (!newAccount.username || !newAccount.password) return;
    const account: AccountConfig = {
      id: Date.now().toString(),
      name: newAccount.username,
      username: newAccount.username,
      password: newAccount.password,
      serverUrl: newAccount.serverUrl,
      isp: newAccount.isp
    };
    
    setConfig({
      ...config,
      accounts: [...config.accounts, account],
      currentAccountId: config.currentAccountId || account.id
    });
    setNewAccount({ username: '', password: '', serverUrl: 'http://10.10.102.50:801', isp: 'campus' });
  };

  const handleSettingChange = (key: string, value: any) => {
    setConfig({
      ...config,
      settings: { ...config.settings, [key]: value }
    });
  };

  const getISPLabel = (isp: ISP) => {
    return ISP_OPTIONS.find(opt => opt.value === isp)?.label || isp;
  };

  return (
    <div className="page-settings">
      <h1 className="page-title">配置设置</h1>

      <div className="card">
        <h3>通用设置</h3>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              style={{ marginRight: 10, width: 18, height: 18 }}
              checked={config.settings.autoLaunch} 
              onChange={(e) => handleSettingChange('autoLaunch', e.target.checked)}
            /> 开机自动启动
          </label>
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              style={{ marginRight: 10, width: 18, height: 18 }}
              checked={config.settings.autoReconnect} 
              onChange={(e) => handleSettingChange('autoReconnect', e.target.checked)}
            /> 断线自动重连
          </label>
        </div>
        <div className="form-group">
          <label>检测间隔 (秒)</label>
          <input 
            type="number" 
            className="form-control"
            value={config.settings.pollingInterval}
            onChange={(e) => handleSettingChange('pollingInterval', parseInt(e.target.value))}
          />
        </div>
      </div>

      <div className="card">
        <h3>账号管理</h3>
        <div style={{ marginBottom: 20 }}>
          {config.accounts.map(acc => (
            <div key={acc.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{acc.username} <span style={{fontSize: '0.8rem', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '12px', marginLeft: '8px'}}>{getISPLabel(acc.isp)}</span></div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{acc.serverUrl}</div>
              </div>
              <button 
                className={`btn ${config.currentAccountId === acc.id ? 'btn-primary' : ''}`}
                style={{ padding: '6px 16px', fontSize: '14px', height: 'auto' }}
                onClick={() => setConfig({
                  ...config,
                  currentAccountId: acc.id
                })}
                disabled={config.currentAccountId === acc.id}
              >
                {config.currentAccountId === acc.id ? '使用中' : '使用此账号'}
              </button>
            </div>
          ))}
        </div>
        
        <h4 style={{ marginBottom: 16 }}>添加新账号</h4>
        <div className="form-group">
          <label>用户名</label>
          <input 
            className="form-control"
            placeholder="请输入学号/用户名"
            value={newAccount.username}
            onChange={e => setNewAccount({...newAccount, username: e.target.value})}
          />
        </div>
        <div className="form-group">
          <label>密码</label>
          <input 
            type="password"
            className="form-control"
            placeholder="请输入密码"
            value={newAccount.password}
            onChange={e => setNewAccount({...newAccount, password: e.target.value})}
          />
        </div>
        <div className="form-group">
          <label>服务商</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {ISP_OPTIONS.map(opt => (
              <div 
                key={opt.value}
                onClick={() => setNewAccount({...newAccount, isp: opt.value})}
                style={{
                  padding: '12px',
                  textAlign: 'center',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid',
                  borderColor: newAccount.isp === opt.value ? 'var(--primary-color)' : 'var(--border-color)',
                  background: newAccount.isp === opt.value ? 'rgba(14, 165, 233, 0.1)' : 'rgba(255, 255, 255, 0.4)',
                  color: newAccount.isp === opt.value ? 'var(--primary-color)' : 'var(--text-color)',
                  cursor: 'pointer',
                  fontWeight: newAccount.isp === opt.value ? '600' : '500',
                  transition: 'all 0.2s ease'
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        </div>
        <div className="form-group">
           <label>登录服务器地址</label>
           <input 
             className="form-control"
             value={newAccount.serverUrl}
             onChange={e => setNewAccount({...newAccount, serverUrl: e.target.value})}
           />
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleAddAccount}>保存并添加账号</button>
      </div>

       <div className="card">
        <h3>WiFi 自动连接</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>WiFi 自动配置功能即将上线，敬请期待...</p>
      </div>
    </div>
  );
};
