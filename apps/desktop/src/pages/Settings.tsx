import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  generateId,
  validateAccountConfig,
  validateWifiConfig,
  resolveWifiSecurity,
  type AccountConfig,
  type WifiConfig,
} from '@repo/shared';
import { ConfigEditor, type EditingTarget } from '../components/settings/ConfigEditor';
import { NearbyWifi } from '../components/settings/NearbyWifi';
import { Settings as SettingsIcon } from 'lucide-react';
import { GeneralSettingsCard } from '../components/settings/GeneralSettingsCard';
import { AccountsCard } from '../components/settings/AccountsCard';
import { WifiConfigCard } from '../components/settings/WifiConfigCard';
import {
  DEFAULT_NEW_ACCOUNT,
  DEFAULT_NEW_WIFI,
  type NewAccountForm,
  type NewWifiForm,
} from '../components/settings/shared';

export const Settings: React.FC = () => {
  const { config, setConfig, configurationState, configurationError } = useApp();
  const [editing, setEditing] = useState<EditingTarget | null>(null);
  const [newAccount, setNewAccount] = useState<NewAccountForm>(DEFAULT_NEW_ACCOUNT);
  const [newWifi, setNewWifi] = useState<NewWifiForm>(DEFAULT_NEW_WIFI);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [wifiError, setWifiError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : '保存配置失败，请重试';

  const handleAddAccount = async () => {
    if (!config) return;
    const username = newAccount.username.trim();
    if (!username || !newAccount.password) {
      setAccountError('请输入用户名和密码');
      return;
    }
    if (config.accounts.some((account) => account.username === username)) {
      setAccountError('该用户名已存在');
      return;
    }
    setAccountError(null);
    setSaveError(null);
    const account: AccountConfig = {
      id: generateId(),
      name: username,
      username,
      password: newAccount.password,
      serverUrl: newAccount.serverUrl,
      isp: newAccount.isp,
    };
    const validation = validateAccountConfig(account);
    if (!validation.valid) {
      setAccountError(validation.errors[0] || '账号配置格式无效');
      return;
    }

    try {
      await setConfig((current) => ({
        ...current,
        accounts: [...current.accounts, account],
        currentAccountId: current.currentAccountId || account.id,
      }));
      setNewAccount(DEFAULT_NEW_ACCOUNT);
    } catch (error) {
      setSaveError(getErrorMessage(error));
    }
  };

  const handleRemoveAccount = async (id: string) => {
    if (!config) return;
    setSaveError(null);
    try {
      await setConfig((current) => {
        const updatedAccounts = current.accounts.filter((account) => account.id !== id);
        const updatedWifiList = current.wifiList.map((wifi) => {
          if (!wifi.linkedAccountIds.includes(id) && wifi.linkedAccountId !== id) {
            return wifi;
          }

          const linkedAccountIds = wifi.linkedAccountIds.filter((accountId) => accountId !== id);
          return {
            ...wifi,
            linkedAccountIds,
            linkedAccountId: linkedAccountIds[0],
          };
        });

        return {
          ...current,
          accounts: updatedAccounts,
          wifiList: updatedWifiList,
          currentAccountId:
            current.currentAccountId === id
              ? updatedAccounts.length > 0
                ? updatedAccounts[0].id
                : null
              : current.currentAccountId,
        };
      });
    } catch (error) {
      setSaveError(getErrorMessage(error));
    }
  };

  const handleAddWifi = async () => {
    if (!config) return;
    const ssid = newWifi.ssid.trim();
    if (!ssid) {
      setWifiError('请输入 WiFi 名称');
      return;
    }
    if (config.wifiList.some((wifi) => wifi.ssid === ssid)) {
      setWifiError('该 WiFi 配置已存在');
      return;
    }
    // 如果需要认证但没选择账号，提示用户
    if (newWifi.requiresAuth && !newWifi.linkedAccountId) {
      setWifiError('需要认证的 WiFi 必须选择关联账号');
      return;
    }
    setWifiError(null);
    setSaveError(null);
    const wifi: WifiConfig = {
      id: generateId(),
      ssid,
      password: newWifi.password,
      security: resolveWifiSecurity(newWifi.security, newWifi.password),
      autoConnect: newWifi.autoConnect,
      requiresAuth: newWifi.requiresAuth,
      linkedAccountIds:
        newWifi.requiresAuth && newWifi.linkedAccountId ? [newWifi.linkedAccountId] : [],
      linkedAccountId: newWifi.requiresAuth ? newWifi.linkedAccountId : undefined,
      priority: newWifi.priority,
      lastConnectedAt: null,
    };
    const validation = validateWifiConfig(wifi);
    if (!validation.valid) {
      setWifiError(validation.errors[0] || 'WiFi 配置格式无效');
      return;
    }

    try {
      await setConfig((current) => ({
        ...current,
        wifiList: [...current.wifiList, wifi],
      }));
      setNewWifi(DEFAULT_NEW_WIFI);
    } catch (error) {
      setSaveError(getErrorMessage(error));
    }
  };

  const handleRemoveWifi = async (id: string) => {
    if (!config) return;
    setSaveError(null);
    try {
      await setConfig((current) => ({
        ...current,
        wifiList: current.wifiList.filter((wifi) => wifi.id !== id),
      }));
    } catch (error) {
      setSaveError(getErrorMessage(error));
    }
  };

  // 切换WiFi自动重连状态
  const handleToggleWifiAutoConnect = async (id: string) => {
    if (!config) return;
    setSaveError(null);
    try {
      await setConfig((current) => ({
        ...current,
        wifiList: current.wifiList.map((wifi) =>
          wifi.id === id ? { ...wifi, autoConnect: !wifi.autoConnect } : wifi
        ),
      }));
    } catch (error) {
      setSaveError(getErrorMessage(error));
    }
  };

  const handleSettingChange = async (key: string, value: unknown) => {
    if (!config) return;
    setSaveError(null);
    try {
      await setConfig((current) => ({
        ...current,
        settings: { ...current.settings, [key]: value },
      }));
    } catch (error) {
      setSaveError(getErrorMessage(error));
    }
  };

  const handleSwitchAccount = async (id: string) => {
    if (!config) return;
    setSaveError(null);
    try {
      await setConfig((current) => ({ ...current, currentAccountId: id }));
    } catch (error) {
      setSaveError(getErrorMessage(error));
    }
  };

  return (
    <div className="page-settings">
      <h1 className="page-title">
        <SettingsIcon size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
        配置设置
      </h1>

      {configurationState === 'saving' || configurationState === 'saved' ? (
        <div className="card" role="status" aria-live="polite">
          {configurationState === 'saving' ? '正在保存配置…' : '配置已保存并生效'}
        </div>
      ) : null}
      {(saveError || configurationError) && (
        <div className="card" role="alert" style={{ color: 'var(--error-color)' }}>
          {saveError || configurationError}
        </div>
      )}

      {!config ? (
        <div className="card">
          <p>加载中...</p>
        </div>
      ) : (
        <>
          <GeneralSettingsCard
            settings={config.settings}
            onSettingChange={(key, value) => void handleSettingChange(key, value)}
          />
          {config.settings.autoAuthPaused ? (
            <div className="card">
              <p>自动认证已暂停</p>
              <button
                className="btn btn-primary"
                onClick={() => void handleSettingChange('autoAuthPaused', false)}
              >
                恢复自动认证
              </button>
            </div>
          ) : null}
          <NearbyWifi
            config={config}
            onSelect={(network) =>
              setNewWifi((current) => ({
                ...current,
                ssid: network.ssid,
                security: network.security,
              }))
            }
            onEdit={(id) => setEditing({ kind: 'wifi', id })}
          />
          <AccountsCard
            onEditAccount={(id) => setEditing({ kind: 'account', id })}
            accounts={config.accounts}
            currentAccountId={config.currentAccountId}
            newAccount={newAccount}
            setNewAccount={setNewAccount}
            accountError={accountError}
            onAddAccount={() => void handleAddAccount()}
            onRemoveAccount={(id) => void handleRemoveAccount(id)}
            onSwitchAccount={(id) => void handleSwitchAccount(id)}
          />
          <WifiConfigCard
            onEditWifi={(id) => setEditing({ kind: 'wifi', id })}
            wifiList={config.wifiList}
            accounts={config.accounts}
            newWifi={newWifi}
            setNewWifi={setNewWifi}
            wifiError={wifiError}
            onAddWifi={() => void handleAddWifi()}
            onRemoveWifi={(id) => void handleRemoveWifi(id)}
            onToggleAutoConnect={(id) => void handleToggleWifiAutoConnect(id)}
          />
          {editing ? (
            <ConfigEditor
              key={`${editing.kind}-${editing.id}`}
              config={config}
              target={editing}
              onSave={setConfig}
              onClose={() => setEditing(null)}
            />
          ) : null}
        </>
      )}
    </div>
  );
};
