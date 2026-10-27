import React, { useId } from 'react';
import type { AppSettings, NotificationSettings } from '@repo/shared';
import {
  Settings as SettingsIcon,
  Heart,
  RefreshCw,
  Bell,
  Rocket,
  RotateCcw,
  Wifi,
  Download,
  Timer,
  AlertTriangle,
} from 'lucide-react';

const checkboxStyle = { marginRight: 10, width: 18, height: 18 };
const labelStyle = { display: 'flex', alignItems: 'center', cursor: 'pointer' } as const;
const descStyle = { fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 8 };

const NOTIFICATION_ITEMS: Array<{ key: keyof NotificationSettings; label: string }> = [
  { key: 'wifiDisconnected', label: 'WiFi 断开' },
  { key: 'reconnectSuccess', label: '自动重连成功' },
  { key: 'reconnectFailed', label: '自动重连全部失败' },
  { key: 'authRecovered', label: '认证恢复成功' },
];

const ToggleRow: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: React.ReactNode;
  label: string;
  desc?: string;
}> = ({ checked, onChange, icon, label, desc }) => (
  <div className="form-group">
    <label style={labelStyle}>
      <input
        type="checkbox"
        style={checkboxStyle}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {icon} {label}
      {desc && <span style={descStyle}>({desc})</span>}
    </label>
  </div>
);

const NumberRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}> = ({ icon, label, value, min, max, onChange }) => {
  const inputId = useId();

  return (
    <div className="form-group">
      <label htmlFor={inputId}>
        {icon}
        {label}
      </label>
      <input
        id={inputId}
        type="number"
        className="form-control"
        value={value}
        min={min}
        max={max}
        onWheel={(e) => e.currentTarget.blur()}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          if (Number.isFinite(parsed)) {
            onChange(Math.min(max, Math.max(min, parsed)));
          }
        }}
      />
    </div>
  );
};

export const GeneralSettingsCard: React.FC<{
  settings: AppSettings;
  onSettingChange: (key: string, value: unknown) => void;
}> = ({ settings, onSettingChange }) => {
  const setNotification = (key: keyof NotificationSettings, value: boolean) =>
    onSettingChange('notificationSettings', { ...settings.notificationSettings, [key]: value });

  return (
    <>
      <div className="card">
        <h3>
          <SettingsIcon size={18} style={{ marginRight: 8 }} />
          通用设置
        </h3>
        <ToggleRow
          checked={settings.autoLaunch}
          onChange={(v) => onSettingChange('autoLaunch', v)}
          icon={<Rocket size={16} style={{ marginRight: 6 }} />}
          label="开机自动启动"
        />
        <ToggleRow
          checked={settings.enableHeartbeat}
          onChange={(v) => onSettingChange('enableHeartbeat', v)}
          icon={
            <Heart
              size={16}
              style={{ marginRight: 6, color: settings.enableHeartbeat ? '#ef4444' : 'inherit' }}
            />
          }
          label="启用心跳检测"
          desc="按间隔检测网络；关闭后仅在 WiFi 变化时检测，另有 30 秒兜底检查"
        />
        <ToggleRow
          checked={settings.autoReconnect}
          onChange={(v) => onSettingChange('autoReconnect', v)}
          icon={<RefreshCw size={16} style={{ marginRight: 6 }} />}
          label="断线自动重连"
          desc="认证失效时自动登录；WiFi 断开时按优先级重连已开启自动连接的 WiFi"
        />
        <ToggleRow
          checked={settings.startupAutoConnect}
          onChange={(v) => onSettingChange('startupAutoConnect', v)}
          icon={<Wifi size={16} style={{ marginRight: 6 }} />}
          label="启动时自动连接"
          desc="启动时若未连接 WiFi，按优先级连接已配置的 WiFi"
        />
        <ToggleRow
          checked={settings.keepCurrentConnection}
          onChange={(v) => onSettingChange('keepCurrentConnection', v)}
          icon={<Wifi size={16} style={{ marginRight: 6 }} />}
          label="保持当前连接"
          desc="启动时已连接其他 WiFi 则不切换；关闭后切换到附近最高优先级的已配置 WiFi"
        />
        <ToggleRow
          checked={settings.autoUpdate}
          onChange={(v) => onSettingChange('autoUpdate', v)}
          icon={<Download size={16} style={{ marginRight: 6 }} />}
          label="自动检查更新"
          desc="启动 30 秒后检查 GitHub 新版本"
        />

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
          {settings.enableHeartbeat && (
            <>
              <NumberRow
                icon={<Heart size={14} style={{ marginRight: 6 }} />}
                label="心跳检测间隔 (秒)"
                value={settings.heartbeatIntervalSeconds}
                min={5}
                max={300}
                onChange={(v) => onSettingChange('heartbeatIntervalSeconds', v)}
              />
              <NumberRow
                icon={<AlertTriangle size={14} style={{ marginRight: 6 }} />}
                label="连续失败阈值 (次，已在线后连续检测失败达到该次数才重新认证)"
                value={settings.heartbeatFailureThreshold}
                min={1}
                max={10}
                onChange={(v) => onSettingChange('heartbeatFailureThreshold', v)}
              />
            </>
          )}
          <NumberRow
            icon={<RotateCcw size={14} style={{ marginRight: 6 }} />}
            label="单个 WiFi 重试次数"
            value={settings.wifiReconnectRetries}
            min={1}
            max={10}
            onChange={(v) => onSettingChange('wifiReconnectRetries', v)}
          />
          <NumberRow
            icon={<Timer size={14} style={{ marginRight: 6 }} />}
            label="冷却期时长 (分钟，全部 WiFi 失败后暂停重连；0 为不冷却)"
            value={settings.wifiReconnectCooldownMinutes}
            min={0}
            max={60}
            onChange={(v) => onSettingChange('wifiReconnectCooldownMinutes', v)}
          />
        </div>
      </div>

      <div className="card">
        <h3>
          <Bell size={18} style={{ marginRight: 8 }} />
          通知设置
        </h3>
        {NOTIFICATION_ITEMS.map((item) => (
          <ToggleRow
            key={item.key}
            checked={settings.notificationSettings[item.key]}
            onChange={(v) => setNotification(item.key, v)}
            icon={null}
            label={item.label}
          />
        ))}
      </div>
    </>
  );
};
