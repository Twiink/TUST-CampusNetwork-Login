import React from 'react';
import { useApp } from '../context/AppContext';

export const Home: React.FC = () => {
  const { networkStatus, ipAddress, login, logout, config } = useApp();

  const currentAccount = config.accounts.find(a => a.id === config.currentAccountId);

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected': return '已连接';
      case 'disconnected': return '未连接';
      case 'connecting': return '连接中...';
      default: return status;
    }
  };

  return (
    <div className="page-home">
      <h1 className="page-title">运行状态</h1>
      
      <div className="card">
        <h3>网络状态</h3>
        <div style={{ marginBottom: 20 }}>
          当前状态: <span className={`status-badge status-${networkStatus}`}>{getStatusText(networkStatus)}</span>
        </div>
        {networkStatus === 'connected' && (
           <div style={{ marginBottom: 20 }}>
             IP 地址: <strong>{ipAddress}</strong>
           </div>
        )}
        
        <div>
          {networkStatus === 'disconnected' ? (
            <button className="btn btn-primary" onClick={login}>立即连接</button>
          ) : networkStatus === 'connected' ? (
            <button className="btn btn-danger" onClick={logout}>断开连接</button>
          ) : (
            <button className="btn btn-primary" disabled>正在尝试连接...</button>
          )}
        </div>
      </div>

      <div className="card">
        <h3>当前账号</h3>
        {currentAccount ? (
          <div>
            <p><strong>用户名:</strong> {currentAccount.username}</p>
            <p><strong>登录服务器:</strong> {currentAccount.serverUrl}</p>
          </div>
        ) : (
          <p>尚未选择账号，请前往“配置设置”进行设置。</p>
        )}
      </div>
    </div>
  );
};
