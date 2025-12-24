import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AccountConfig, WifiConfig } from '@repo/shared';

export const Settings: React.FC = () => {
  const { config, setConfig } = useApp();
  const [newAccount, setNewAccount] = useState({ username: '', password: '', serverUrl: 'http://10.10.102.50:801' });

  const handleAddAccount = () => {
    if (!newAccount.username || !newAccount.password) return;
    const account: AccountConfig = {
      id: Date.now().toString(),
      name: newAccount.username,
      username: newAccount.username,
      password: newAccount.password,
      serverUrl: newAccount.serverUrl
    };
    
    setConfig({
      ...config,
      accounts: [...config.accounts, account],
      currentAccountId: config.currentAccountId || account.id
    });
    setNewAccount({ username: '', password: '', serverUrl: 'http://10.10.102.50:801' });
  };

  const handleSettingChange = (key: string, value: any) => {
    setConfig({
      ...config,
      settings: { ...config.settings, [key]: value }
    });
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
                <div style={{ fontWeight: 600 }}>{acc.username}</div>
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
