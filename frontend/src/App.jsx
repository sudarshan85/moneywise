import { useState, useEffect } from 'react';
import './index.css';
import Configuration from './pages/Configuration.jsx';

// Tab configuration
const TABS = [
  { id: 'dashboard', label: 'Dashboard', emoji: '📊' },
  { id: 'transactions', label: 'Transactions', emoji: '💰' },
  { id: 'transfers', label: 'Transfers', emoji: '🔄' },
  { id: 'balances', label: 'Balances', emoji: '📋' },
  { id: 'config', label: 'Configuration', emoji: '⚙️' },
  { id: 'reports', label: 'Reports', emoji: '📈' },
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

function TransactionsPage() {
  return (
    <div className="card">
      <div className="empty-state">
        <div className="emoji">💰</div>
        <p>Transactions coming in Phase 2</p>
      </div>
    </div>
  );
}

function TransfersPage() {
  return (
    <div className="card">
      <div className="empty-state">
        <div className="emoji">🔄</div>
        <p>Category Transfers coming in Phase 3</p>
      </div>
    </div>
  );
}

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
        <div className="emoji">📈</div>
        <p>Reports coming in Phase 6</p>
      </div>
    </div>
  );
}

// Tab content mapping
const TAB_CONTENT = {
  dashboard: DashboardPage,
  transactions: TransactionsPage,
  transfers: TransfersPage,
  balances: BalancesPage,
  config: Configuration,
  reports: ReportsPage,
};


function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [apiStatus, setApiStatus] = useState(null);

  // Check API health on mount
  useEffect(() => {
    fetch('http://localhost:3001/api/health')
      .then(res => res.json())
      .then(data => setApiStatus(data))
      .catch(err => setApiStatus({ status: 'error', message: err.message }));
  }, []);

  const ActivePage = TAB_CONTENT[activeTab];

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <h1>
          <span>🍯</span>
          MoneyPot
        </h1>
      </header>

      {/* Tab Navigation */}
      <nav className="tab-nav">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="emoji">{tab.emoji}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {/* API Status (for development) */}
        {apiStatus && (
          <div className={`card mb-md ${apiStatus.status === 'ok' ? '' : 'text-danger'}`}>
            <div className="flex items-center gap-sm">
              <span>{apiStatus.status === 'ok' ? '✅' : '❌'}</span>
              <span>
                API: {apiStatus.status === 'ok' ? `Connected to ${apiStatus.app}` : `Error - ${apiStatus.message}`}
              </span>
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
