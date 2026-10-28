import { PauseBanner } from '../components/home/PauseBanner';
import { matchWifiRule, resolveLoginAccounts } from '@repo/shared';
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useHeartbeat } from '../hooks/useHeartbeat';
import { useWifiReconnect } from '../hooks/useWifiReconnect';
import {
  Wifi,
  WifiOff,
  Loader,
  Globe,
  AlertCircle,
  CheckCircle2,
  Settings,
  LogIn,
  LogOut,
} from 'lucide-react';
import { WifiInfoCard } from '../components/wifi/WifiInfoCard';
import { WifiSwitcherCard } from '../components/wifi/WifiSwitcherCard';
import { WifiReconnectProgressCard } from '../components/wifi/WifiReconnectProgressCard';
import { WifiReconnectFailedCard } from '../components/wifi/WifiReconnectFailedCard';
import { HeartbeatStatusCard } from '../components/heartbeat/HeartbeatStatusCard';
import { ReconnectProgressBanner } from '../components/heartbeat/ReconnectProgressBanner';
import { HomeNoticeCard, HomeToast } from '../components/notice/HomeNoticeCard';

export const Home: React.FC = () => {
  const {
    networkStatus,
    login,
    logout,
    config,
    status: fullNetworkStatus,
    wifiConnected,
    wifiSSID,
    fetchStatus,
    loading,
    initialCheckDone,
  } = useApp();
  const { heartbeat, reconnectProgress } = useHeartbeat();
  const { progress: wifiReconnectProgress, allFailed, clearAllFailed } = useWifiReconnect();
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [switching, setSwitching] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
      if (switchRefreshTimerRef.current) clearTimeout(switchRefreshTimerRef.current);
    };
  }, []);

  // 显示toast提示
  const showToast = (message: string, type: 'success' | 'error') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  };

  // WiFi切换处理
  const handleWifiSwitch = async (id: string) => {
    const ssid = config?.wifiList.find((wifi) => wifi.id === id)?.ssid ?? id;
    if (switching) return;

    setSwitching(true);
    try {
      const success = await window.electronAPI.wifi.switch(id);
      if (success) {
        showToast(`正在切换到 ${ssid}，请稍候...`, 'success');
        // 等待WiFi连接完成后刷新状态
        if (switchRefreshTimerRef.current) {
          clearTimeout(switchRefreshTimerRef.current);
        }
        switchRefreshTimerRef.current = setTimeout(async () => {
          await fetchStatus();
          switchRefreshTimerRef.current = null;
        }, 3000);
      } else {
        showToast(`切换到 ${ssid} 失败，请重试`, 'error');
      }
    } catch (error) {
      console.error('WiFi切换失败:', error);
      showToast('WiFi切换失败，请检查网络设置', 'error');
    } finally {
      if (switchTimerRef.current) {
        clearTimeout(switchTimerRef.current);
      }
      switchTimerRef.current = setTimeout(() => {
        setSwitching(false);
        switchTimerRef.current = null;
      }, 1000);
    }
  };

  // 手动刷新WiFi信息
  const handleRefresh = async () => {
    const now = Date.now();
    // 防抖：2秒内不允许重复刷新
    if (now - lastRefreshTime < 2000) {
      return;
    }

    setRefreshing(true);
    setLastRefreshTime(now);

    try {
      await fetchStatus();
      showToast('WiFi 信息已更新', 'success');
    } catch (error) {
      console.error('Failed to refresh WiFi info:', error);
      showToast('刷新失败，请重试', 'error');
    } finally {
      // 确保至少显示1秒的加载动画
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        setRefreshing(false);
        refreshTimerRef.current = null;
      }, 1000);
    }
  };

  // 优先级 0：如果还在初始检测或正在加载，显示加载状态
  if (!initialCheckDone || loading) {
    return (
      <div className="page-home">
        <h1 className="page-title">
          <Globe size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          运行状态
        </h1>
        <PauseBanner />

        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Loader
            size={64}
            color="var(--primary-color)"
            style={{
              marginBottom: 24,
              animation: 'spin 1s linear infinite',
            }}
          />
          <h2 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>
            {!initialCheckDone ? '正在检测 WiFi 连接...' : '正在获取 WiFi 详情...'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {!initialCheckDone ? '请稍候，正在检查网络连接状态' : '正在获取网络配置信息，请稍候'}
          </p>
        </div>
      </div>
    );
  }

  // 第一优先级：检查 WiFi 连接状态（无论是否配置账户）
  if (!wifiConnected) {
    return (
      <div className="page-home">
        <h1 className="page-title">
          <Globe size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          运行状态
        </h1>
        <PauseBanner />

        <HomeNoticeCard
          icon={WifiOff}
          iconColor="#ef4444"
          tintRgb="239, 68, 68"
          title="未连接 WiFi"
          description="当前设备未连接到任何 WiFi 网络，请先连接 WiFi。"
          hint={
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <AlertCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              连接到 WiFi 后才能使用网络认证功能
            </p>
          }
        />

        {/* WiFi 重连进度卡片 */}
        {wifiReconnectProgress && <WifiReconnectProgressCard progress={wifiReconnectProgress} />}

        {/* WiFi 重连全部失败卡片 */}
        {allFailed && <WifiReconnectFailedCard allFailed={allFailed} onClose={clearAllFailed} />}

        <HeartbeatStatusCard
          enabled={!!config?.settings.enableHeartbeat}
          wifiConnected={wifiConnected}
          pollingInterval={config?.settings.heartbeatIntervalSeconds ?? 30}
          heartbeat={heartbeat}
        />

        <ReconnectProgressBanner progress={reconnectProgress} />
      </div>
    );
  }

  // 第二优先级：检查 WiFi 是否在配置列表中
  const wifiConfig = config
    ? matchWifiRule(config.wifiList, { ...fullNetworkStatus, ssid: wifiSSID ?? '' })
    : null;

  if (!wifiConfig) {
    return (
      <div className="page-home">
        <h1 className="page-title">
          <Globe size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          运行状态
        </h1>
        <PauseBanner />

        {/* WiFi 基础信息 - 必须显示 */}
        <div className="card">
          <h3>
            <Wifi size={18} style={{ marginRight: 8 }} />
            当前 WiFi
          </h3>
          <WifiInfoCard
            networkStatus={fullNetworkStatus}
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        </div>

        {/* WiFi 重连进度卡片 */}
        {wifiReconnectProgress && <WifiReconnectProgressCard progress={wifiReconnectProgress} />}

        {/* WiFi 重连全部失败卡片 */}
        {allFailed && <WifiReconnectFailedCard allFailed={allFailed} onClose={clearAllFailed} />}

        <HeartbeatStatusCard
          enabled={!!config?.settings.enableHeartbeat}
          wifiConnected={wifiConnected}
          pollingInterval={config?.settings.heartbeatIntervalSeconds ?? 30}
          heartbeat={heartbeat}
        />

        <ReconnectProgressBanner progress={reconnectProgress} />

        {/* WiFi 切换卡片 */}
        {config && (
          <WifiSwitcherCard
            config={config}
            currentSsid={wifiSSID}
            onSwitch={handleWifiSwitch}
            switching={switching}
          />
        )}

        {/* WiFi 未配置警告 */}
        <HomeNoticeCard
          icon={AlertCircle}
          iconColor="#f59e0b"
          tintRgb="245, 158, 11"
          title={
            config?.wifiList.some((w) => w.ssid === wifiSSID)
              ? '请选择当前 WiFi 规则'
              : '该 WiFi 未配置'
          }
          description={
            <>
              {config?.wifiList.some((w) => w.ssid === wifiSSID)
                ? '同名 WiFi 身份信息不足或规则不匹配，请在配置设置中选择安全类型及 BSSID 后重试。'
                : `当前连接的 WiFi "${wifiSSID}" 尚未配置，请前往"配置设置"添加此 WiFi 的配置。`}
            </>
          }
          hint={
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <Settings size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              点击左侧菜单的&quot;配置设置&quot;添加 WiFi 配置
            </p>
          }
        />
      </div>
    );
  }

  // 第三优先级：检查是否需要认证
  if (!wifiConfig.requiresAuth) {
    return (
      <div className="page-home">
        <h1 className="page-title">
          <Globe size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          运行状态
        </h1>
        <PauseBanner />

        {/* WiFi 基础信息 */}
        <div className="card">
          <h3>
            <Wifi size={18} style={{ marginRight: 8 }} />
            当前 WiFi
          </h3>
          <WifiInfoCard
            networkStatus={fullNetworkStatus}
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        </div>

        {/* WiFi 重连进度卡片 */}
        {wifiReconnectProgress && <WifiReconnectProgressCard progress={wifiReconnectProgress} />}

        {/* WiFi 重连全部失败卡片 */}
        {allFailed && <WifiReconnectFailedCard allFailed={allFailed} onClose={clearAllFailed} />}

        <HeartbeatStatusCard
          enabled={!!config?.settings.enableHeartbeat}
          wifiConnected={wifiConnected}
          pollingInterval={config?.settings.heartbeatIntervalSeconds ?? 30}
          heartbeat={heartbeat}
        />

        <ReconnectProgressBanner progress={reconnectProgress} />

        {/* WiFi 切换卡片 */}
        {config && (
          <WifiSwitcherCard
            config={config}
            currentSsid={wifiSSID}
            onSwitch={handleWifiSwitch}
            switching={switching}
          />
        )}

        {/* 无需认证提示 */}
        <HomeNoticeCard
          icon={CheckCircle2}
          iconColor="#22c55e"
          tintRgb="34, 197, 94"
          title="无需认证"
          description="当前 WiFi 无需校园网认证，可直接使用。"
          hint={
            <>
              <p
                style={{
                  margin: '0 0 4px 0',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                }}
              >
                此 WiFi 已配置为「无需认证」
              </p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                如家庭 WiFi、手机热点等网络
              </p>
            </>
          }
        />
      </div>
    );
  }

  // 第四优先级：检查是否有关联账户
  const linkedAccount = config
    ? resolveLoginAccounts(config, { ...fullNetworkStatus, ssid: wifiSSID ?? '' })[0]
    : undefined;

  if (!linkedAccount) {
    return (
      <div className="page-home">
        <h1 className="page-title">
          <Globe size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          运行状态
        </h1>
        <PauseBanner />

        {/* WiFi 基础信息 */}
        <div className="card">
          <h3>
            <Wifi size={18} style={{ marginRight: 8 }} />
            当前 WiFi
          </h3>
          <WifiInfoCard
            networkStatus={fullNetworkStatus}
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        </div>

        {/* WiFi 重连进度卡片 */}
        {wifiReconnectProgress && <WifiReconnectProgressCard progress={wifiReconnectProgress} />}

        {/* WiFi 重连全部失败卡片 */}
        {allFailed && <WifiReconnectFailedCard allFailed={allFailed} onClose={clearAllFailed} />}

        <HeartbeatStatusCard
          enabled={!!config?.settings.enableHeartbeat}
          wifiConnected={wifiConnected}
          pollingInterval={config?.settings.heartbeatIntervalSeconds ?? 30}
          heartbeat={heartbeat}
        />

        <ReconnectProgressBanner progress={reconnectProgress} />

        {/* WiFi 切换卡片 */}
        {config && (
          <WifiSwitcherCard
            config={config}
            currentSsid={wifiSSID}
            onSwitch={handleWifiSwitch}
            switching={switching}
          />
        )}

        {/* 未配置账户警告 */}
        <HomeNoticeCard
          icon={AlertCircle}
          iconColor="#f59e0b"
          tintRgb="245, 158, 11"
          title="未配置账户"
          description={
            <>
              该 WiFi 需要校园网认证，但尚未关联账户。请前往&quot;配置设置&quot;添加账户并关联到此
              WiFi。
            </>
          }
          hint={
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              <Settings size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              点击左侧菜单的&quot;配置设置&quot;添加账户并关联
            </p>
          }
        />
      </div>
    );
  }

  // 显示完整认证界面
  return (
    <div className="page-home">
      <h1 className="page-title">
        <Globe size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
        运行状态
      </h1>
      <PauseBanner />

      {/* WiFi 基础信息 */}
      <div className="card">
        <h3>
          <Wifi size={18} style={{ marginRight: 8 }} />
          当前 WiFi
        </h3>
        <WifiInfoCard
          networkStatus={fullNetworkStatus}
          onRefresh={handleRefresh}
          refreshing={refreshing}
        />
      </div>

      {/* 需要认证提示 */}
      <HomeNoticeCard
        icon={AlertCircle}
        iconColor="#f59e0b"
        tintRgb="245, 158, 11"
        title="需要认证"
        description="当前 WiFi 需要校园网认证，请点击下方按钮进行认证。"
        hint={
          <>
            <p
              style={{
                margin: '0 0 4px 0',
                fontSize: '0.9rem',
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
            >
              此 WiFi 已配置为「需要认证」
            </p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              如校园网 CMCC/CUCC/CTCC
            </p>
          </>
        }
        action={
          networkStatus === 'disconnected' ? (
            <button
              className="btn btn-primary"
              style={{ padding: '8px 20px', fontSize: '0.9rem', height: 'auto', flexShrink: 0 }}
              onClick={login}
            >
              <LogIn size={16} style={{ marginRight: 6 }} />
              立即连接
            </button>
          ) : networkStatus === 'connected' ? (
            <button
              className="btn btn-danger"
              style={{ padding: '8px 20px', fontSize: '0.9rem', height: 'auto', flexShrink: 0 }}
              onClick={logout}
            >
              <LogOut size={16} style={{ marginRight: 6 }} />
              断开连接
            </button>
          ) : (
            <button
              className="btn btn-primary"
              style={{ padding: '8px 20px', fontSize: '0.9rem', height: 'auto', flexShrink: 0 }}
              disabled
            >
              <Loader size={16} style={{ marginRight: 6 }} className="spin" />
              正在认证...
            </button>
          )
        }
      />

      {/* WiFi 重连进度卡片 */}
      {wifiReconnectProgress && <WifiReconnectProgressCard progress={wifiReconnectProgress} />}

      {/* WiFi 重连全部失败卡片 */}
      {allFailed && <WifiReconnectFailedCard allFailed={allFailed} onClose={clearAllFailed} />}

      <HeartbeatStatusCard
        enabled={!!config?.settings.enableHeartbeat}
        wifiConnected={wifiConnected}
        pollingInterval={config?.settings.heartbeatIntervalSeconds ?? 30}
        heartbeat={heartbeat}
      />

      <ReconnectProgressBanner progress={reconnectProgress} />

      {/* WiFi 切换卡片 */}
      {config && (
        <WifiSwitcherCard
          config={config}
          currentSsid={wifiSSID}
          onSwitch={handleWifiSwitch}
          switching={switching}
        />
      )}

      {/* Toast 提示 */}
      <HomeToast toast={toast} />
    </div>
  );
};
