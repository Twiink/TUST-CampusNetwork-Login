import React from 'react';
import { useApp } from '../context/AppContext';

export const Home: React.FC = () => {
  const { networkStatus, ipAddress, login, logout, config } = useApp();

  const currentAccount = config.accounts.find(a => a.id === config.currentAccountId);

  return (
    <div className="page-home">
      <h1 className="page-title">Dashboard</h1>
      
      <div className="card">
        <h3>Network Status</h3>
        <div style={{ marginBottom: 20 }}>
          Status: <span className={`status-badge status-${networkStatus}`}>{networkStatus.toUpperCase()}</span>
        </div>
        {networkStatus === 'connected' && (
           <div style={{ marginBottom: 20 }}>
             IP Address: <strong>{ipAddress}</strong>
           </div>
        )}
        
        <div>
          {networkStatus === 'disconnected' ? (
            <button className="btn btn-primary" onClick={login}>Connect</button>
          ) : networkStatus === 'connected' ? (
            <button className="btn btn-danger" onClick={logout}>Disconnect</button>
          ) : (
            <button className="btn btn-primary" disabled>Connecting...</button>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Current Account</h3>
        {currentAccount ? (
          <div>
            <p><strong>Username:</strong> {currentAccount.username}</p>
            <p><strong>Server:</strong> {currentAccount.serverUrl}</p>
          </div>
        ) : (
          <p>No account selected. Please go to Settings.</p>
        )}
      </div>
    </div>
  );
};
