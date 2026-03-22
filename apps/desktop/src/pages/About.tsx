import React, { useState, useEffect } from 'react';
import { Info, Github, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';

export const About: React.FC = () => {
  const [updateStatus, setUpdateStatus] = useState<'checking' | 'available' | 'latest' | 'error'>('latest');
  const [version, setVersion] = useState('0.0.0');

  useEffect(() => {
    // 获取当前版本
    if (window.electronAPI) {
      setVersion('0.0.0'); // 暂时使用固定版本，后续可通过 IPC 获取
    }
  }, []);

  const checkForUpdates = async () => {
    setUpdateStatus('checking');
    try {
      if (window.electronAPI?.update) {
        const available = await window.electronAPI.update.check();
        setUpdateStatus(available ? 'available' : 'latest');
      } else {
        setUpdateStatus('error');
      }
    } catch {
      setUpdateStatus('error');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <Info size={24} style={{ marginRight: 12 }} />
        <h1 className="page-title">关于</h1>
      </div>

      <div className="card" style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>NetMate</h2>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 24 }}>
            智能 WiFi 管理工具
          </p>
          <div style={{
            display: 'inline-block',
            padding: '6px 16px',
            background: 'var(--primary-color)',
            color: 'white',
            borderRadius: 20,
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 32
          }}>
            版本 {version}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>核心功能</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center' }}>
              <CheckCircle size={16} style={{ marginRight: 8, color: 'var(--success-color)' }} />
              WiFi 自动重连（三阶段优先级切换）
            </li>
            <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center' }}>
              <CheckCircle size={16} style={{ marginRight: 8, color: 'var(--success-color)' }} />
              校园网认证自动登录
            </li>
            <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center' }}>
              <CheckCircle size={16} style={{ marginRight: 8, color: 'var(--success-color)' }} />
              多账户管理
            </li>
            <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center' }}>
              <CheckCircle size={16} style={{ marginRight: 8, color: 'var(--success-color)' }} />
              网络状态监控
            </li>
            <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center' }}>
              <CheckCircle size={16} style={{ marginRight: 8, color: 'var(--success-color)' }} />
              心跳检测与断线重连
            </li>
          </ul>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 24, marginTop: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>更新检查</h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {updateStatus === 'checking' && (
                <>
                  <div className="spinner" style={{ marginRight: 8 }} />
                  <span>正在检查更新...</span>
                </>
              )}
              {updateStatus === 'latest' && (
                <>
                  <CheckCircle size={18} style={{ marginRight: 8, color: 'var(--success-color)' }} />
                  <span>已是最新版本</span>
                </>
              )}
              {updateStatus === 'available' && (
                <>
                  <AlertCircle size={18} style={{ marginRight: 8, color: 'var(--warning-color)' }} />
                  <span>发现新版本</span>
                </>
              )}
              {updateStatus === 'error' && (
                <>
                  <AlertCircle size={18} style={{ marginRight: 8, color: 'var(--error-color)' }} />
                  <span>检查失败</span>
                </>
              )}
            </div>
            <button
              className="btn-secondary"
              onClick={checkForUpdates}
              disabled={updateStatus === 'checking'}
            >
              检查更新
            </button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 24, marginTop: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>项目信息</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <a
              href="https://github.com/yourusername/netmate"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                color: 'var(--text-color)',
                textDecoration: 'none',
                padding: '8px 12px',
                borderRadius: 8,
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-bg)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Github size={18} style={{ marginRight: 8 }} />
              <span>GitHub 仓库</span>
              <ExternalLink size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />
            </a>
            <a
              href="https://github.com/yourusername/netmate/issues"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                color: 'var(--text-color)',
                textDecoration: 'none',
                padding: '8px 12px',
                borderRadius: 8,
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-bg)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <AlertCircle size={18} style={{ marginRight: 8 }} />
              <span>问题反馈</span>
              <ExternalLink size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />
            </a>
          </div>
        </div>

        <div style={{
          borderTop: '1px solid var(--border-color)',
          paddingTop: 24,
          marginTop: 24,
          textAlign: 'center',
          fontSize: 12,
          opacity: 0.6
        }}>
          <p style={{ margin: 0 }}>© 2026 NetMate. All rights reserved.</p>
          <p style={{ margin: '8px 0 0 0' }}>基于 Electron + React 构建</p>
        </div>
      </div>
    </div>
  );
};
