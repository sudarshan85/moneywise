import { useEffect, useState } from 'react';
import * as api from '../api/client.js';
import './Dashboard.css';

// Helper to check if icon is an emoji vs image path
function isEmoji(str) {
    if (!str) return false;
    return !str.startsWith('/') && !str.startsWith('http');
}

// Render icon - handles both emoji and image paths
function IconDisplay({ icon, fallback, className = 'icon' }) {
    const iconSrc = icon || fallback;
    if (isEmoji(iconSrc)) {
        return <span className={`${className} emoji-icon`}>{iconSrc}</span>;
    }
    return <img src={iconSrc} alt="" className={className} />;
}

// Format currency
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '—';
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Format date for display
function formatDate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

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

export default function Dashboard() {
    const [dashboardData, setDashboardData] = useState(null);
    const [categoryDetails, setCategoryDetails] = useState(null);
    const [selectedCategoryId, setSelectedCategoryId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch dashboard data on mount
    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                const data = await api.getDashboardData();
                setDashboardData(data);

                // Default to first category (prefer "Groceries" if exists)
                if (data.categories.length > 0) {
                    const groceries = data.categories.find(c =>
                        c.name.toLowerCase().includes('groceries') ||
                        c.name.toLowerCase().includes('grocery')
                    );
                    const defaultCat = groceries || data.categories[0];
                    setSelectedCategoryId(defaultCat.id);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    // Fetch category details when selection changes
    useEffect(() => {
        if (!selectedCategoryId) return;

        async function fetchCategoryDetails() {
            try {
                const details = await api.getCategoryDetails(selectedCategoryId);
                setCategoryDetails(details);
            } catch (err) {
                console.error('Failed to fetch category details:', err);
            }
        }
        fetchCategoryDetails();
    }, [selectedCategoryId]);

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

    // Get selected category for dropdown display
    const selectedCategory = categories.find(c => c.id === selectedCategoryId);

    // Count over-budget categories
    const overBudgetCount = categories.filter(c => c.available < 0).length;

    return (
        <div className="dashboard">
            {/* Budget Overview Cards */}
            <div className="budget-overview">
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

            {/* Main Dashboard Grid - 3 columns */}
            <div className="dashboard-grid">
                {/* Left Panel - Assets & Debt */}
                <div className="accounts-section">
                    {/* Assets */}
                    <div className="account-panel assets-panel">
                        <div className="account-panel-header">Assets</div>
                        <div className="account-list">
                            {assets.length === 0 ? (
                                <div className="no-accounts">No asset accounts</div>
                            ) : (
                                assets.map(acc => (
                                    <div key={acc.id} className="account-row">
                                        <div className="account-name">
                                            <IconDisplay icon={acc.icon} fallback="/icons/briefcase.png" className="account-icon" />
                                            <span>{acc.name}</span>
                                        </div>
                                        <div className="account-balance">
                                            {formatCurrency(acc.balance)}
                                        </div>
                                    </div>
                                ))
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
                                liabilities.map(acc => (
                                    <div key={acc.id} className="account-row">
                                        <div className="account-name">
                                            <IconDisplay icon={acc.icon} fallback="/icons/briefcase.png" className="account-icon" />
                                            <span>{acc.name}</span>
                                        </div>
                                        <div className="account-balance">
                                            {formatCurrency(acc.balance)}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Center - Category Table */}
                <div className="category-section">
                    <table className="category-table">
                        <thead>
                            <tr>
                                <th className="col-category">Category</th>
                                <th className="col-available">Available</th>
                                <th className="col-pending">Pending</th>
                                <th className="col-activity">Activity</th>
                                <th className="col-monthly">Monthly Amt</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map(cat => (
                                <tr
                                    key={cat.id}
                                    className={`category-row ${selectedCategoryId === cat.id ? 'selected' : ''}`}
                                    onClick={() => setSelectedCategoryId(cat.id)}
                                >
                                    <td className="category-name">
                                        <IconDisplay icon={cat.icon} fallback="/icons/cat.png" className="category-icon" />
                                        <span>{cat.name}</span>
                                    </td>
                                    <td className={`available-cell ${cat.available < 0 ? 'over-budget' : 'on-budget'}`}>
                                        {cat.available < 0 && <span className="warning-icon">⚠️ </span>}
                                        {formatCurrency(cat.available)}
                                    </td>
                                    <td className={`pending-cell ${cat.pendingActivity !== 0 ? 'has-pending' : ''}`}>
                                        {cat.pendingActivity !== 0 ? formatCurrency(cat.pendingActivity) : '—'}
                                    </td>
                                    <td className={`activity-cell ${cat.activity < 0 ? 'expense' : cat.activity > 0 ? 'income' : ''}`}>
                                        {formatCurrency(cat.activity)}
                                    </td>
                                    <td className="monthly-cell">
                                        {formatCurrency(cat.monthlyAmount)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Right Panel - Category Details */}
                <div className="details-section">
                    <div className="details-panel">
                        <div className="panel-header">
                            <span className="panel-title">Category Details</span>
                            <select
                                className="category-select"
                                value={selectedCategoryId || ''}
                                onChange={(e) => setSelectedCategoryId(Number(e.target.value))}
                            >
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.icon && isEmoji(cat.icon) ? `${cat.icon} ` : ''}{cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {categoryDetails && (
                            <div className="category-details-content">
                                {/* Progress Bar */}
                                <div className="spending-progress">
                                    <div className="progress-label">
                                        <span>Budget Usage</span>
                                        <span className="percent-remaining">
                                            {categoryDetails.percentRemaining}% remaining
                                        </span>
                                    </div>
                                    <div className="progress-bar">
                                        <div
                                            className={`progress-fill ${categoryDetails.percentRemaining <= 0 ? 'over' : categoryDetails.percentRemaining < 20 ? 'warning' : ''}`}
                                            style={{ width: `${Math.min(100, 100 - categoryDetails.percentRemaining)}%` }}
                                        ></div>
                                    </div>
                                </div>

                                <div className="details-grid">
                                    <div className="detail-row">
                                        <span className="detail-label">Carried Forward</span>
                                        <span className="detail-value">
                                            {categoryDetails.carriedForward === 0 ? 'N/A' : formatCurrency(categoryDetails.carriedForward)}
                                        </span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">Spent Last Month</span>
                                        <span className="detail-value">
                                            {categoryDetails.spentLastMonth === 0 ? 'N/A' : formatCurrency(categoryDetails.spentLastMonth)}
                                        </span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">Transactions This Month</span>
                                        <span className="detail-value">
                                            {categoryDetails.transactionCount || 0}
                                        </span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">Avg per Transaction</span>
                                        <span className="detail-value">
                                            {categoryDetails.transactionCount > 0 ? formatCurrency(categoryDetails.avgPerTransaction) : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="detail-row">
                                        <span className="detail-label">Monthly Amount</span>
                                        <span className="detail-value highlight">
                                            {formatCurrency(categoryDetails.monthlyAmount)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
