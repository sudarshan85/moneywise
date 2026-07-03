import { useState, useEffect } from 'react';
import './index.css';
import Configuration from './pages/Configuration.jsx';
import Transactions from './pages/Transactions.jsx';
import Transfers from './pages/Transfers.jsx';
import Dashboard from './pages/Dashboard.jsx';
// import Reports from './pages/Reports.jsx'; // Commented out — Reports tab disabled pending redesign (see FUTURE_WORK.md)
import Login from './pages/Login.jsx';
import { Toaster } from './components/Toast.jsx';
import { checkAuthStatus } from './api/client';

// Tab configuration - icon can be emoji string or PNG path
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'transactions', label: 'Transactions', icon: '💸' },
  { id: 'transfers', label: 'Transfers', icon: '🔄' },
  // { id: 'reports', label: 'Reports', icon: '📉' }, // Disabled — see FUTURE_WORK.md
  { id: 'config', label: 'Configuration', icon: '⚙️' },
];




// Tab content mapping
const TAB_CONTENT = {
  dashboard: Dashboard,
  transactions: Transactions,
  transfers: Transfers,
  config: Configuration,
  // reports: Reports, // Disabled — see FUTURE_WORK.md
};

// Helper to render tab icon (emoji or PNG)
function TabIcon({ icon }) {
  if (icon.endsWith('.png')) {
    return <img src={icon} alt="" className="tab-icon" />;
  }
  return <span className="emoji">{icon}</span>;
}

function App() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(null); // null = loading
  const [passwordRequired, setPasswordRequired] = useState(true);

  // Get initial tab from URL hash or default to 'dashboard'
  const getTabFromHash = () => {
    const hash = window.location.hash.replace('#', '');
    const validTabs = TABS.map(t => t.id);
    return validTabs.includes(hash) ? hash : 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getTabFromHash);
  const [apiStatus, setApiStatus] = useState(null);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus()
      .then(data => {
        setIsAuthenticated(data.authenticated);
        setPasswordRequired(data.passwordRequired);
      })
      .catch(() => {
        // If can't reach server, show login (will fail gracefully)
        setIsAuthenticated(false);
        setPasswordRequired(true);
      });
  }, []);

  // Handle successful login
  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  // Update URL hash when tab changes
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    window.location.hash = tabId;
  };

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      setActiveTab(getTabFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const ActivePage = TAB_CONTENT[activeTab];

  // Show loading state while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="app-splash">
        <img src="/icons/moneywise_icon.png" alt="MoneyWise" className="app-splash-logo" />
        <div>Loading…</div>
      </div>
    );
  }

  // Show login page if not authenticated and password is required
  if (!isAuthenticated && passwordRequired) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <h1>
          <img src="/icons/moneywise_icon.png" alt="MoneyWise" className="app-logo" />
          MoneyWise
        </h1>
      </header>

      {/* Tab Navigation */}
      <nav className="tab-nav">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            <TabIcon icon={tab.icon} />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {/* Active Tab Content */}
        <ActivePage />
      </main>

      <Toaster />
    </div>
  );
}

export default App;

