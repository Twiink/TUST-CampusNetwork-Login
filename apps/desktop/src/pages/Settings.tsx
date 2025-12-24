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
      <h1 className="page-title">Settings</h1>

      <div className="card">
        <h3>General Settings</h3>
        <div className="form-group">
          <label>
            <input 
              type="checkbox" 
              checked={config.settings.autoLaunch} 
              onChange={(e) => handleSettingChange('autoLaunch', e.target.checked)}
            /> Auto Launch on Startup
          </label>
        </div>
        <div className="form-group">
          <label>
            <input 
              type="checkbox" 
              checked={config.settings.autoReconnect} 
              onChange={(e) => handleSettingChange('autoReconnect', e.target.checked)}
            /> Auto Reconnect
          </label>
        </div>
        <div className="form-group">
          <label>Polling Interval (seconds)</label>
          <input 
            type="number" 
            className="form-control"
            value={config.settings.pollingInterval}
            onChange={(e) => handleSettingChange('pollingInterval', parseInt(e.target.value))}
          />
        </div>
      </div>

      <div className="card">
        <h3>Accounts</h3>
        <div style={{ marginBottom: 15 }}>
          {config.accounts.map(acc => (
            <div key={acc.id} style={{ padding: 10, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
              <span>{acc.username} ({acc.serverUrl})</span>
              <button 
                onClick={() => setConfig({
                  ...config,
                  currentAccountId: acc.id
                })}
                disabled={config.currentAccountId === acc.id}
              >
                {config.currentAccountId === acc.id ? 'Active' : 'Select'}
              </button>
            </div>
          ))}
        </div>
        
        <h4>Add Account</h4>
        <div className="form-group">
          <label>Username</label>
          <input 
            className="form-control"
            value={newAccount.username}
            onChange={e => setNewAccount({...newAccount, username: e.target.value})}
          />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input 
            type="password"
            className="form-control"
            value={newAccount.password}
            onChange={e => setNewAccount({...newAccount, password: e.target.value})}
          />
        </div>
        <div className="form-group">
           <label>Server URL</label>
           <input 
             className="form-control"
             value={newAccount.serverUrl}
             onChange={e => setNewAccount({...newAccount, serverUrl: e.target.value})}
           />
        </div>
        <button className="btn btn-primary" onClick={handleAddAccount}>Add Account</button>
      </div>

       <div className="card">
        <h3>WiFi Auto-Connect</h3>
        <p style={{ color: '#888' }}>WiFi configuration feature coming soon...</p>
      </div>
    </div>
  );
};
