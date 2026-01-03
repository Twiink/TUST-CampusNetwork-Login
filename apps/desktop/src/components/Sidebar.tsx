import React from 'react';
import { Globe, Settings, FileText, Wifi } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { useApp } from '../context/AppContext';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  const { theme, setTheme } = useApp();

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <Wifi size={20} style={{ marginRight: 8 }} />
        NetMate
      </div>
      <div
        className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => onTabChange('home')}
      >
        <Globe size={18} style={{ marginRight: 10 }} />
        运行状态
      </div>
      <div
        className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
      >
        <Settings size={18} style={{ marginRight: 10 }} />
        配置设置
      </div>
      <div
        className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
        onClick={() => onTabChange('logs')}
      >
        <FileText size={18} style={{ marginRight: 10 }} />
        运行日志
      </div>

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
