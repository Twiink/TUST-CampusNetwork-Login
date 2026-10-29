import { useEffect, useRef, useState } from 'react';
import {
  editAccount,
  editWifi,
  moveLinkedAccount,
  type AppConfig,
  type AccountConfig,
  type WifiConfig,
  type ISP,
} from '@repo/shared';
import { ISP_OPTIONS } from './shared';
import './config-editor.css';
export type EditingTarget = { kind: 'account' | 'wifi'; id: string };
export function ConfigEditor({
  config,
  target,
  onSave,
  onClose,
}: {
  config: AppConfig;
  target: EditingTarget;
  onSave: (update: (current: AppConfig) => AppConfig) => Promise<void>;
  onClose: () => void;
}) {
  const account = config.accounts.find((a) => a.id === target.id);
  const wifi = config.wifiList.find((w) => w.id === target.id);
  const [draft, setDraft] = useState<AccountConfig | WifiConfig>(
    target.kind === 'account'
      ? { ...account! }
      : { ...wifi!, linkedAccountIds: [...wifi!.linkedAccountIds] }
  );
  const [password, setPassword] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const change = (values: Partial<AccountConfig & WifiConfig>) =>
    setDraft((previous) => ({ ...previous, ...values }));
  const data = draft as WifiConfig;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave((current) =>
        target.kind === 'account'
          ? editAccount(current, target.id, draft as AccountConfig, password)
          : editWifi(
              current,
              target.id,
              { ...data, security: data.security || null },
              password,
              clearPassword
            )
      );
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="config-dialog"
      aria-labelledby="editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form onSubmit={submit}>
        <h2 id="editor-title">{target.kind === 'account' ? '编辑账号' : '编辑 WiFi'}</h2>
        {target.kind === 'account' ? (
          <>
            <label htmlFor="edit-username">用户名</label>
            <input
              id="edit-username"
              className="form-control"
              required
              value={(draft as AccountConfig).username}
              onChange={(e) => change({ username: e.target.value })}
            />
            <label htmlFor="edit-server">服务器地址</label>
            <input
              id="edit-server"
              className="form-control"
              required
              value={(draft as AccountConfig).serverUrl}
              onChange={(e) => change({ serverUrl: e.target.value })}
            />
            <label htmlFor="edit-isp">运营商</label>
            <select
              id="edit-isp"
              className="form-control"
              value={(draft as AccountConfig).isp}
              onChange={(e) => change({ isp: e.target.value as ISP })}
            >
              {ISP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label htmlFor="edit-ssid">WiFi 名称</label>
            <input
              id="edit-ssid"
              className="form-control"
              required
              value={data.ssid}
              onChange={(e) => change({ ssid: e.target.value })}
            />
            <label htmlFor="edit-security">安全类型（留空自动识别）</label>
            <input
              id="edit-security"
              className="form-control"
              value={data.security ?? ''}
              placeholder="WPA2 / WPA3 / WPA2-WPA3 / Open"
              onChange={(e) => change({ security: e.target.value || undefined })}
            />
            <label htmlFor="edit-bssid">BSSID（可选，限定接入点）</label>
            <input
              id="edit-bssid"
              className="form-control"
              value={data.bssid ?? ''}
              placeholder="aa:bb:cc:dd:ee:ff"
              onChange={(e) => change({ bssid: e.target.value || undefined })}
            />
            <label htmlFor="edit-priority">优先级</label>
            <input
              id="edit-priority"
              className="form-control"
              type="number"
              min="1"
              max="99"
              required
              value={data.priority}
              onChange={(e) => change({ priority: Number(e.target.value) })}
            />
            <label className="editor-check">
              <input
                type="checkbox"
                checked={data.autoConnect}
                onChange={(e) => change({ autoConnect: e.target.checked })}
              />
              自动连接此 WiFi
            </label>
            <label className="editor-check">
              <input
                type="checkbox"
                checked={data.requiresAuth}
                onChange={(e) => change({ requiresAuth: e.target.checked })}
              />
              需要校园网认证
            </label>
            {data.requiresAuth ? (
              <fieldset>
                <legend>关联账号（按顺序尝试）</legend>
                {config.accounts.map((item) => (
                  <label key={item.id} className="editor-check">
                    <input
                      type="checkbox"
                      checked={data.linkedAccountIds.includes(item.id)}
                      onChange={(e) =>
                        change({
                          linkedAccountIds: e.target.checked
                            ? [...data.linkedAccountIds, item.id]
                            : data.linkedAccountIds.filter((id) => id !== item.id),
                        })
                      }
                    />
                    {item.username}
                  </label>
                ))}
                <ol>
                  {data.linkedAccountIds.map((id, index) => (
                    <li key={id}>
                      {config.accounts.find((item) => item.id === id)?.username}
                      <button
                        type="button"
                        className="btn"
                        aria-label={`上移账号 ${index + 1}`}
                        disabled={index === 0}
                        onClick={() =>
                          change({
                            linkedAccountIds: moveLinkedAccount(data.linkedAccountIds, id, -1),
                          })
                        }
                      >
                        上移
                      </button>
                      <button
                        type="button"
                        className="btn"
                        aria-label={`下移账号 ${index + 1}`}
                        disabled={index === data.linkedAccountIds.length - 1}
                        onClick={() =>
                          change({
                            linkedAccountIds: moveLinkedAccount(data.linkedAccountIds, id, 1),
                          })
                        }
                      >
                        下移
                      </button>
                    </li>
                  ))}
                </ol>
              </fieldset>
            ) : null}
          </>
        )}
        <label htmlFor="edit-password">新密码（留空保留原密码）</label>
        <input
          id="edit-password"
          className="form-control"
          type="password"
          autoComplete="new-password"
          value={password}
          disabled={clearPassword}
          onChange={(e) => setPassword(e.target.value)}
        />
        {target.kind === 'wifi' ? (
          <label className="editor-check">
            <input
              type="checkbox"
              checked={clearPassword}
              onChange={(e) => setClearPassword(e.target.checked)}
            />
            清除应用保存的 WiFi 密码
          </label>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <footer>
          <button type="button" className="btn" disabled={saving} onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? '保存中…' : '保存修改'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
