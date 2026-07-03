import { useEffect, useState } from 'react';
import * as api from '../api/client.js';
import { IconDisplay } from '../components/IconDisplay.jsx';
import { formatCurrency, formatDate } from '../utils/format.js';
import './Dashboard.css';

// Alert component for over-budget categories
function OverBudgetAlert({ count }) {
    if (count <= 0) return null;
    return (
        <div className="over-budget-alert">
            <span className="alert-icon">⚠️</span>
            <span className="alert-text">
                Heads up! You have <strong>{count} {count === 1 ? 'category' : 'categories'}</strong> over budget.
            </span>
        </div>
    );
}

// ==================== CATEGORY CARD ====================
function CategoryCard({ category, isExpanded, onToggle, categoryDetails }) {
    const { name, icon, available, monthlyAmount, activity, pendingActivity, carriedForward } = category;

    // Calculate progress percentage (how much spent out of budget)
    const spent = Math.abs(activity); // Activity is negative for spending
    const percentUsed = monthlyAmount > 0 ? Math.min(100, Math.max(0, (spent / monthlyAmount) * 100)) : 0;

    // Determine card state
    const isOverBudget = available < 0;
    const isLowBudget = !isOverBudget && monthlyAmount > 0 && (available / monthlyAmount) < 0.2;
    const hasPending = pendingActivity !== 0;

    let cardState = 'healthy';
    if (isOverBudget) cardState = 'over-budget';
    else if (isLowBudget) cardState = 'low-budget';

    return (
        <div className={`category-card ${cardState} ${isExpanded ? 'expanded' : ''}`}>
            <div
                className="card-main"
                onClick={onToggle}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggle();
                    }
                }}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-label={`${name}, ${formatCurrency(available)} remaining`}
            >
                <div className="card-header">
                    <div className="card-icon">
                        <IconDisplay icon={icon} fallback="📦" className="category-icon-large" />
                    </div>
                    <div className="card-name">{name}</div>
                    {hasPending && <span className="pending-badge" title="Has pending transactions">🅿️</span>}
                </div>

                <div className="card-amount">
                    {isOverBudget && <span className="warning-icon">⚠️</span>}
                    <span className={`remaining-value ${isOverBudget ? 'negative' : isLowBudget ? 'low-budget' : available === 0 ? 'zero' : ''}`}>
                        {formatCurrency(available)}
                    </span>
                    <span className="remaining-label">remaining</span>
                </div>

                <div className="card-progress">
                    <div className="progress-bar-mini">
                        <div
                            className={`progress-fill-mini ${cardState}`}
                            style={{ width: `${Math.min(100, percentUsed)}%` }}
                        />
                    </div>
                    <div className="progress-text-large">
                        <span className={`spent-amount ${cardState}`}>{formatCurrency(spent)}</span>
                        {monthlyAmount > 0 && (
                            <>
                                <span className="separator"> / </span>
                                <span className="allocated-amount">{formatCurrency(monthlyAmount)}</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="card-expand-hint">
                    {isExpanded ? '▲' : '▼'}
                </div>
            </div>

            {isExpanded && (
                <div className="card-details">
                    <div className="card-stats-list">
                        <div className="stat-row">
                            <span className="stat-label">Pending</span>
                            <span className={`stat-value ${pendingActivity !== 0 ? 'pending' : 'muted'}`}>
                                {pendingActivity !== 0 ? formatCurrency(pendingActivity) : '—'}
                            </span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">Total Txns</span>
                            <span className={`stat-value ${!categoryDetails?.transactionCount ? 'muted' : ''}`}>
                                {categoryDetails?.transactionCount || '—'}
                            </span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">Avg per Txn</span>
                            <span className={`stat-value ${!categoryDetails?.avgPerTransaction ? 'muted' : ''}`}>
                                {categoryDetails && categoryDetails.avgPerTransaction > 0
                                    ? formatCurrency(categoryDetails.avgPerTransaction)
                                    : '—'}
                            </span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">Spent Last Month</span>
                            <span className={`stat-value ${!categoryDetails?.spentLastMonth ? 'muted' : ''}`}>
                                {categoryDetails && categoryDetails.spentLastMonth > 0
                                    ? formatCurrency(categoryDetails.spentLastMonth)
                                    : '—'}
                            </span>
                        </div>
                        <div className="stat-row">
                            <span className="stat-label">Carried Forward</span>
                            <span className={`stat-value ${carriedForward === 0 ? 'muted' : ''}`}>
                                {carriedForward !== 0 ? formatCurrency(carriedForward) : '—'}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ==================== MAIN DASHBOARD ====================
export default function Dashboard() {
    const [dashboardData, setDashboardData] = useState(null);
    const [moneyPot, setMoneyPot] = useState(null);
    const [expandedCardId, setExpandedCardId] = useState(null);
    const [cardTransactions, setCardTransactions] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch dashboard data on mount
    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                const [data, pot] = await Promise.all([
                    api.getDashboardData(),
                    api.getMoneyPotBalance(),
                ]);
                setDashboardData(data);
                setMoneyPot(pot);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // Fetch transactions when a card is expanded
    const handleCardToggle = async (categoryId) => {
        if (expandedCardId === categoryId) {
            setExpandedCardId(null);
            return;
        }

        setExpandedCardId(categoryId);

        // Fetch transactions for this category if not already loaded
        if (!cardTransactions[categoryId]) {
            try {
                const details = await api.getCategoryDetails(categoryId);
                setCardTransactions(prev => ({
                    ...prev,
                    [categoryId]: details
                }));
            } catch (err) {
                console.error('Failed to fetch category transactions:', err);
            }
        }
    };

    if (loading) {
        return (
            <div className="dashboard-loading">
                <div className="loading-spinner"></div>
                <p>Loading dashboard...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="dashboard-error">
                <span>⚠️</span>
                <p>Error loading dashboard: {error}</p>
            </div>
        );
    }

    if (!dashboardData) return null;

    const { monthlyIncome, monthlySpent, pendingCount, categories, assets, liabilities, lastReconciled } = dashboardData;

    // Account order comes from the server (user-managed sort_order)
    const sortedAssets = assets;

    // Count over-budget categories
    const overBudgetCount = categories.filter(c => c.available < 0).length;

    const readyToAssign = moneyPot?.balance ?? 0;
    const isOverCommitted = readyToAssign < 0;

    return (
        <div className="dashboard">
            {/* Budget Overview Cards */}
            <div className="budget-overview">
                {moneyPot && (
                    <div className={`overview-card ready-to-assign ${isOverCommitted ? 'negative' : ''}`}>
                        <div className="overview-label">
                            {isOverCommitted ? 'Over-committed' : 'Ready to Assign'}
                        </div>
                        <div className="overview-value">{formatCurrency(Math.abs(readyToAssign))}</div>
                        <div className="overview-hint">
                            {formatCurrency(moneyPot.liquid)} liquid − {formatCurrency(moneyPot.creditCardOwed)} card − {formatCurrency(moneyPot.allocated)} in envelopes
                        </div>
                    </div>
                )}
                <div className="overview-card income">
                    <div className="overview-label">Monthly Income</div>
                    <div className="overview-value">{formatCurrency(monthlyIncome)}</div>
                </div>
                <div className="overview-card spent">
                    <div className="overview-label">Spent This Month</div>
                    <div className="overview-value">{formatCurrency(monthlySpent)}</div>
                </div>
                {pendingCount > 0 && (
                    <div className="overview-card pending">
                        <div className="overview-label">Pending Transactions</div>
                        <div className="overview-value pending-count">{pendingCount}</div>
                    </div>
                )}
                <div className="overview-card reconciled">
                    <div className="overview-label">Accounts last reconciled on</div>
                    <div className="overview-value date">
                        {lastReconciled ? formatDate(lastReconciled) : 'Never'}
                    </div>
                </div>
            </div>

            {/* Over Budget Alert */}
            <OverBudgetAlert count={overBudgetCount} />

            {/* Main Dashboard Grid - 2 columns: accounts + categories */}
            <div className="dashboard-grid-v2">
                {/* Left Panel - Assets & Debt */}
                <div className="accounts-column">
                    {/* Assets */}
                    <div className="account-panel assets-panel">
                        <div className="account-panel-header">Assets</div>
                        <div className="account-list">
                            {sortedAssets.length === 0 ? (
                                <div className="no-accounts">No asset accounts</div>
                            ) : (
                                sortedAssets.map(acc => {
                                    const hasPending = acc.pendingBalance !== 0;
                                    return (
                                        <div key={acc.id} className="account-row">
                                            <div className="account-name">
                                                <IconDisplay icon={acc.icon} fallback="/icons/briefcase.png" className="account-icon" />
                                                <span>{acc.name}</span>
                                            </div>
                                            <div className="account-balances-inline">
                                                <span className="account-balance-main">
                                                    {formatCurrency(acc.balance)}
                                                </span>
                                                {hasPending && (
                                                    <span className={`pending-inline ${acc.pendingBalance >= 0 ? 'inflow' : 'outflow'}`}>
                                                        ({formatCurrency(acc.pendingBalance, { sign: true })})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Debt */}
                    <div className="account-panel debt-panel">
                        <div className="account-panel-header">Debt</div>
                        <div className="account-list">
                            {liabilities.length === 0 ? (
                                <div className="no-accounts">No debt accounts</div>
                            ) : (
                                liabilities.map(acc => {
                                    const hasPending = acc.pendingBalance !== 0;
                                    return (
                                        <div key={acc.id} className="account-row">
                                            <div className="account-name">
                                                <IconDisplay icon={acc.icon} fallback="/icons/briefcase.png" className="account-icon" />
                                                <span>{acc.name}</span>
                                            </div>
                                            <div className="account-balances-inline">
                                                <span className="account-balance-main">
                                                    {formatCurrency(acc.balance)}
                                                </span>
                                                {hasPending && (
                                                    <span className={`pending-inline ${acc.pendingBalance >= 0 ? 'inflow' : 'outflow'}`}>
                                                        ({formatCurrency(acc.pendingBalance, { sign: true })})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Panel - Category Card Grid */}
                <div className="categories-column">
                    <div className="category-card-grid">
                        {categories.map(cat => (
                            <CategoryCard
                                key={cat.id}
                                category={cat}
                                isExpanded={expandedCardId === cat.id}
                                onToggle={() => handleCardToggle(cat.id)}
                                categoryDetails={cardTransactions[cat.id]}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
