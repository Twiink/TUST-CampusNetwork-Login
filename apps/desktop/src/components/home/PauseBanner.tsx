import { useApp } from '../../context/AppContext';
export function PauseBanner() {
  const { config, setConfig } = useApp();
  if (!config?.settings.autoAuthPaused) return null;
  return (
    <div className="card" role="status">
      <p>自动认证已暂停</p>
      <button
        className="btn btn-primary"
        onClick={() => {
          setConfig((current) => ({
            ...current,
            settings: { ...current.settings, autoAuthPaused: false },
          })).catch(() => undefined);
        }}
      >
        恢复自动认证
      </button>
    </div>
  );
}
