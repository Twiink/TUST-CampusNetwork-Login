import React from 'react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        校园网登录
      </div>
      <div 
        className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => onTabChange('home')}
      >
        运行状态
      </div>
      <div 
        className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
      >
        配置设置
      </div>
      <div 
        className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
        onClick={() => onTabChange('logs')}
      >
        运行日志
      </div>
    </div>
  );
};
