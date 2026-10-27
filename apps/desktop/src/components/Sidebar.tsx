import React from 'react';
import { Globe, Settings, FileText, Wifi, Info } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../context/ThemeContext';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <Wifi size={20} style={{ marginRight: 8 }} />
        NetMate
      </div>
      <button
        type="button"
        className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => onTabChange('home')}
        aria-current={activeTab === 'home' ? 'page' : undefined}
      >
        <Globe size={18} style={{ marginRight: 10 }} />
        运行状态
      </button>
      <button
        type="button"
        className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
        aria-current={activeTab === 'settings' ? 'page' : undefined}
      >
        <Settings size={18} style={{ marginRight: 10 }} />
        配置设置
      </button>
      <button
        type="button"
        className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
        onClick={() => onTabChange('logs')}
        aria-current={activeTab === 'logs' ? 'page' : undefined}
      >
        <FileText size={18} style={{ marginRight: 10 }} />
        运行日志
      </button>
      <button
        type="button"
        className={`nav-item ${activeTab === 'about' ? 'active' : ''}`}
        onClick={() => onTabChange('about')}
        aria-current={activeTab === 'about' ? 'page' : undefined}
      >
        <Info size={18} style={{ marginRight: 10 }} />
        关于
      </button>

      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          justifyContent: 'center',
          paddingBottom: '20px',
        }}
      >
        <ThemeToggle value={theme} onChange={setTheme} size={1.5} />
      </div>
    </div>
  );
};
