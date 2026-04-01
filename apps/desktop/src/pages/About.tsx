import React, { useState, useEffect } from 'react';
import { Info, Github, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import type { UpdateStatus } from '../types/electron';

const REPOSITORY_URL = 'https://github.com/Twiink/TUST-Campusnet-Login';
const ISSUES_URL = `${REPOSITORY_URL}/issues`;

const initialUpdateStatus: UpdateStatus = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  progress: 0,
  version: null,
  error: null,
};

export const About: React.FC = () => {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(initialUpdateStatus);
  const [version, setVersion] = useState('0.0.0');

  useEffect(() => {
    let isMounted = true;

    const loadInitialState = async () => {
      if (!window.electronAPI) {
        return;
      }

      const [currentVersion, currentUpdateStatus] = await Promise.all([
        window.electronAPI.app.getVersion(),
        window.electronAPI.update.getStatus(),
      ]);

      if (!isMounted) {
        return;
      }

      setVersion(currentVersion);
      setUpdateStatus(currentUpdateStatus);
    };

    void loadInitialState();

    const unsubscribe = window.electronAPI.on('event:update:statusChanged', (data: unknown) => {
      setUpdateStatus(data as UpdateStatus);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const checkForUpdates = async () => {
    try {
      if (window.electronAPI?.update) {
        await window.electronAPI.update.check();
      }
    } catch {
      setUpdateStatus((prev) => ({ ...prev, error: '检查更新失败' }));
    }
  };

  const downloadUpdate = async () => {
    await window.electronAPI.update.download();
  };

  const installUpdate = async () => {
    await window.electronAPI.update.install();
  };

  const getStatusLabel = () => {
    if (updateStatus.error) {
      return { text: updateStatus.error, tone: 'error' as const };
    }

    if (updateStatus.downloaded) {
      return { text: '更新已下载，可立即安装', tone: 'success' as const };
    }

    if (updateStatus.downloading) {
      return {
        text: `正在下载更新 ${updateStatus.progress.toFixed(1)}%`,
        tone: 'checking' as const,
      };
    }

    if (updateStatus.checking) {
      return { text: '正在检查更新...', tone: 'checking' as const };
    }

    if (updateStatus.available) {
      return {
        text: `发现新版本 ${updateStatus.version || ''}`.trim(),
        tone: 'available' as const,
      };
    }

    return { text: '已是最新版本', tone: 'latest' as const };
  };

  const statusMeta = getStatusLabel();

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
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 24 }}>智能 WiFi 管理工具</p>
          <div
            style={{
              display: 'inline-block',
              padding: '6px 16px',
              background: 'var(--primary-color)',
              color: 'white',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 32,
            }}
          >
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
              {statusMeta.tone === 'checking' && (
                <>
                  <div className="spinner" style={{ marginRight: 8 }} />
                  <span>{statusMeta.text}</span>
                </>
              )}
              {statusMeta.tone === 'latest' && (
                <>
                  <CheckCircle
                    size={18}
                    style={{ marginRight: 8, color: 'var(--success-color)' }}
                  />
                  <span>{statusMeta.text}</span>
                </>
              )}
              {statusMeta.tone === 'available' && (
                <>
                  <AlertCircle
                    size={18}
                    style={{ marginRight: 8, color: 'var(--warning-color)' }}
                  />
                  <span>{statusMeta.text}</span>
                </>
              )}
              {statusMeta.tone === 'success' && (
                <>
                  <CheckCircle
                    size={18}
                    style={{ marginRight: 8, color: 'var(--success-color)' }}
                  />
                  <span>{statusMeta.text}</span>
                </>
              )}
              {statusMeta.tone === 'error' && (
                <>
                  <AlertCircle size={18} style={{ marginRight: 8, color: 'var(--error-color)' }} />
                  <span>{statusMeta.text}</span>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {updateStatus.available && !updateStatus.downloading && !updateStatus.downloaded && (
                <button className="btn-primary" onClick={downloadUpdate}>
                  下载更新
                </button>
              )}
              {updateStatus.downloaded && (
                <button className="btn-primary" onClick={installUpdate}>
                  立即安装
                </button>
              )}
              <button
                className="btn-secondary"
                onClick={checkForUpdates}
                disabled={updateStatus.checking || updateStatus.downloading}
              >
                检查更新
              </button>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 24, marginTop: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>项目信息</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                color: 'var(--text-color)',
                textDecoration: 'none',
                padding: '8px 12px',
                borderRadius: 8,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Github size={18} style={{ marginRight: 8 }} />
              <span>GitHub 仓库</span>
              <ExternalLink size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />
            </a>
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                color: 'var(--text-color)',
                textDecoration: 'none',
                padding: '8px 12px',
                borderRadius: 8,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <AlertCircle size={18} style={{ marginRight: 8 }} />
              <span>问题反馈</span>
              <ExternalLink size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />
            </a>
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid var(--border-color)',
            paddingTop: 24,
            marginTop: 24,
            textAlign: 'center',
            fontSize: 12,
            opacity: 0.6,
          }}
        >
          <p style={{ margin: 0 }}>© 2026 NetMate. All rights reserved.</p>
          <p style={{ margin: '8px 0 0 0' }}>基于 Electron + React 构建</p>
        </div>
      </div>
    </div>
  );
};
