import React from 'react';
import type { AppSettings } from '@repo/shared';
import { Settings as SettingsIcon, Heart, RefreshCw, Bell, Rocket, RotateCcw } from 'lucide-react';

export const GeneralSettingsCard: React.FC<{
  settings: AppSettings;
  onSettingChange: (key: string, value: unknown) => void;
}> = ({ settings, onSettingChange }) => {
  return (
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
            checked={settings.autoLaunch}
            onChange={(e) => onSettingChange('autoLaunch', e.target.checked)}
          />
          <Rocket size={16} style={{ marginRight: 6 }} /> 开机自动启动
        </label>
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            style={{ marginRight: 10, width: 18, height: 18 }}
            checked={settings.enableHeartbeat}
            onChange={(e) => onSettingChange('enableHeartbeat', e.target.checked)}
          />
          <Heart
            size={16}
            style={{
              marginRight: 6,
              color: settings.enableHeartbeat ? '#ef4444' : 'inherit',
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
            checked={settings.autoReconnect}
            onChange={(e) => onSettingChange('autoReconnect', e.target.checked)}
          />
          <RefreshCw size={16} style={{ marginRight: 6 }} /> 断线自动重连
        </label>
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            style={{ marginRight: 10, width: 18, height: 18 }}
            checked={settings.showNotification}
            onChange={(e) => onSettingChange('showNotification', e.target.checked)}
          />
          <Bell size={16} style={{ marginRight: 6 }} /> 显示通知
        </label>
      </div>
      {settings.enableHeartbeat && (
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
            value={settings.pollingInterval}
            min={5}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => onSettingChange('pollingInterval', parseInt(e.target.value) || 30)}
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
          value={settings.maxRetries}
          min={1}
          max={10}
          onWheel={(e) => e.currentTarget.blur()}
          onChange={(e) => onSettingChange('maxRetries', parseInt(e.target.value) || 3)}
        />
      </div>
    </div>
  );
};
