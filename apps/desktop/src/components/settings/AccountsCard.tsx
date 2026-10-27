import React from 'react';
import type { AccountConfig } from '@repo/shared';
import { User, Server, Check, Plus, Trash2, Lock, Globe } from 'lucide-react';
import { ISP_OPTIONS, getISPLabel, type NewAccountForm } from './shared';

export const AccountsCard: React.FC<{
  accounts: AccountConfig[];
  currentAccountId: string | null;
  newAccount: NewAccountForm;
  setNewAccount: React.Dispatch<React.SetStateAction<NewAccountForm>>;
  accountError?: string | null;
  onAddAccount: () => void;
  onRemoveAccount: (id: string) => void;
  onSwitchAccount: (id: string) => void;
}> = ({
  accounts,
  currentAccountId,
  newAccount,
  setNewAccount,
  accountError,
  onAddAccount,
  onRemoveAccount,
  onSwitchAccount,
}) => {
  return (
    <div className="card">
      <h3>
        <User size={18} style={{ marginRight: 8 }} />
        账号管理
      </h3>
      <div style={{ marginBottom: 20 }}>
        {accounts.length === 0 ? (
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
          <div role="list" aria-label="账号列表">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                role="listitem"
                aria-label={`账号 ${acc.username}`}
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
                    className={`btn ${currentAccountId === acc.id ? 'btn-primary' : ''}`}
                    style={{ padding: '6px 16px', fontSize: '14px', height: 'auto' }}
                    onClick={() => onSwitchAccount(acc.id)}
                    disabled={currentAccountId === acc.id}
                  >
                    {currentAccountId === acc.id ? (
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
                    onClick={() => onRemoveAccount(acc.id)}
                    aria-label={`删除账号 ${acc.username}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
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
          aria-label="用户名"
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
          aria-label="密码"
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
            <button
              type="button"
              key={opt.value}
              onClick={() => setNewAccount({ ...newAccount, isp: opt.value })}
              aria-pressed={newAccount.isp === opt.value}
              style={{
                padding: '12px',
                textAlign: 'center',
                borderRadius: 'var(--radius-md)',
                border: '1px solid',
                borderColor:
                  newAccount.isp === opt.value ? 'var(--primary-color)' : 'var(--border-color)',
                background:
                  newAccount.isp === opt.value
                    ? 'rgba(14, 165, 233, 0.1)'
                    : 'rgba(255, 255, 255, 0.4)',
                color: newAccount.isp === opt.value ? 'var(--primary-color)' : 'var(--text-color)',
                cursor: 'pointer',
                fontWeight: newAccount.isp === opt.value ? '600' : '500',
                transition: 'all 0.2s ease',
              }}
            >
              {opt.label}
            </button>
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
          aria-label="登录服务器地址"
          value={newAccount.serverUrl}
          onChange={(e) => setNewAccount({ ...newAccount, serverUrl: e.target.value })}
        />
      </div>
      {accountError && (
        <p role="alert" style={{ color: 'var(--error-color)', margin: '0 0 12px' }}>
          {accountError}
        </p>
      )}
      <button className="btn btn-primary" style={{ width: '100%' }} onClick={onAddAccount}>
        <Plus size={16} style={{ marginRight: 6 }} />
        保存并添加账号
      </button>
    </div>
  );
};
