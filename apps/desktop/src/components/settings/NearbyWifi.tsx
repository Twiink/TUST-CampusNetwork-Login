import { useState } from 'react';
import type { AppConfig } from '@repo/shared';
type Network = Awaited<ReturnType<Window['electronAPI']['wifi']['scan']>>[number];
export function NearbyWifi({
  config,
  onSelect,
  onEdit,
}: {
  config: AppConfig;
  onSelect: (network: Network) => void;
  onEdit: (id: string) => void;
}) {
  const [networks, setNetworks] = useState<Network[] | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const scan = async () => {
    setLoading(true);
    setError('');
    try {
      setNetworks(await window.electronAPI.wifi.scan());
    } catch {
      setError('扫描失败，请检查 WiFi 开关和系统网络权限后重试');
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="card" aria-labelledby="nearby-title">
      <h3 id="nearby-title">附近 WiFi</h3>
      <p>扫描附近网络，选择后添加配置或编辑已保存的网络。</p>
      <button className="btn" disabled={loading} onClick={() => void scan()}>
        {loading ? '扫描中…' : '扫描附近 WiFi'}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {networks?.length === 0 ? (
        <p role="status">未发现网络，请确认 WiFi 已开启，或手动填写 WiFi 名称。</p>
      ) : null}
      <ul className="nearby-list">
        {networks?.map((network, index) => {
          const saved = config.wifiList.find((w) => w.ssid === network.ssid);
          return (
            <li key={`${network.ssid}-${index}`}>
              <span>
                {network.ssid} · {network.signalStrength}% · {network.security}
                {saved ? ' · 已保存' : ''}
              </span>
              <button
                className="btn"
                aria-label={`${saved ? '编辑' : '选择'}网络 ${network.ssid}`}
                onClick={() => (saved ? onEdit(saved.id) : onSelect(network))}
              >
                {saved ? '编辑' : '选择'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
