import React, { useState } from 'react';
import './App.css';
import { AppProvider } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { Sidebar } from './components/Sidebar';
import { Home } from './pages/Home';
import { Settings } from './pages/Settings';
import { Logs } from './pages/Logs';
import { About } from './pages/About';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="main-content">
        {activeTab === 'home' && <Home onConfigure={() => setActiveTab('settings')} />}
        {activeTab === 'settings' && <Settings />}
        {activeTab === 'logs' && <Logs />}
        {activeTab === 'about' && <About />}
      </div>
    </div>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ThemeProvider>
  );
}

export default App;
