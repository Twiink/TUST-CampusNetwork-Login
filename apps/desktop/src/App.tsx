import React, { useState } from 'react';
import './App.css';
import { AppProvider } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { Home } from './pages/Home';
import { Settings } from './pages/Settings';
import { Logs } from './pages/Logs';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="main-content">
        {activeTab === 'home' && <Home />}
        {activeTab === 'settings' && <Settings />}
        {activeTab === 'logs' && <Logs />}
      </div>
    </div>
  );
};

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
