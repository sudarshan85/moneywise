import { useState, useEffect } from 'react';
import './index.css';
import Configuration from './pages/Configuration.jsx';
import Transactions from './pages/Transactions.jsx';
import Transfers from './pages/Transfers.jsx';

// Tab configuration - icon can be emoji string or PNG path
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'transactions', label: 'Transactions', icon: '💸' },
  { id: 'transfers', label: 'Transfers', icon: '🔄' },
  { id: 'balances', label: 'Balances', icon: '📋' },
  { id: 'reports', label: 'Reports', icon: '📉' },
  { id: 'config', label: 'Configuration', icon: '⚙️' },
];

// Placeholder page components (to be implemented in later phases)
function DashboardPage() {
  return (
    <div className="card">
      <div className="empty-state">
        <div className="emoji">📊</div>
        <p>Dashboard coming in Phase 4</p>
      </div>
    </div>
  );
}

// TransfersPage placeholder removed - using real Transfers component

function BalancesPage() {
  return (
    <div className="card">
      <div className="empty-state">
        <div className="emoji">📋</div>
        <p>Balances coming in Phase 5</p>
      </div>
    </div>
  );
}

function ReportsPage() {
  return (
    <div className="card">
      <div className="empty-state">
        <div className="emoji">📉</div>
        <p>Reports coming in Phase 6</p>
      </div>
    </div>
  );
}

// Tab content mapping
const TAB_CONTENT = {
  dashboard: DashboardPage,
  transactions: Transactions,
  transfers: Transfers,
  balances: BalancesPage,
  config: Configuration,
  reports: ReportsPage,
};

// Helper to render tab icon (emoji or PNG)
function TabIcon({ icon }) {
  if (icon.endsWith('.png')) {
    return <img src={icon} alt="" className="tab-icon" />;
  }
  return <span className="emoji">{icon}</span>;
}

function App() {
  // Get initial tab from URL hash or default to 'dashboard'
  const getTabFromHash = () => {
    const hash = window.location.hash.replace('#', '');
    const validTabs = TABS.map(t => t.id);
    return validTabs.includes(hash) ? hash : 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getTabFromHash);
  const [apiStatus, setApiStatus] = useState(null);
  const [moneyPotBalance, setMoneyPotBalance] = useState(null);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);

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

  // Check API health on mount
  useEffect(() => {
    fetch('http://localhost:3001/api/health')
      .then(res => res.json())
      .then(data => setApiStatus(data))
      .catch(err => setApiStatus({ status: 'error', message: err.message }));
  }, []);

  // Fetch Available to Budget on mount, tab change, or when data changes
  useEffect(() => {
    fetch('http://localhost:3001/api/accounts/moneypot')
      .then(res => res.json())
      .then(data => setMoneyPotBalance(data.balance))
      .catch(err => console.error('Failed to fetch Available to Budget:', err));
  }, [activeTab, balanceRefreshKey]);

  // Listen for custom events to refresh the balance
  useEffect(() => {
    const handleRefresh = () => setBalanceRefreshKey(k => k + 1);
    window.addEventListener('moneywise:refresh-balance', handleRefresh);
    return () => window.removeEventListener('moneywise:refresh-balance', handleRefresh);
  }, []);

  const ActivePage = TAB_CONTENT[activeTab];

  // Format currency for display
  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '—';
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <h1>
          <img src="/icons/moneywise_icon.png" alt="MoneyWise" className="app-logo" />
          MoneyWise
        </h1>
        <div className="moneypot-display">
          <span className="moneypot-label">Available to Budget</span>
          <span className={`moneypot-balance ${moneyPotBalance < 0 ? 'negative' : ''}`}>
            {formatCurrency(moneyPotBalance)}
          </span>
        </div>
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
        {/* Show error only if API fails */}
        {apiStatus && apiStatus.status !== 'ok' && (
          <div className="card mb-md text-danger">
            <div className="flex items-center gap-sm">
              <span>❌</span>
              <span>API Error: {apiStatus.message}</span>
            </div>
          </div>
        )}

        {/* Active Tab Content */}
        <ActivePage />
      </main>
    </div>
  );
}

export default App;
