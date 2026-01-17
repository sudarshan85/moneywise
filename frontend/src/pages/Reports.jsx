import { useEffect, useState, useMemo } from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    AreaChart, Area
} from 'recharts';
import * as api from '../api/client.js';
import './Reports.css';

// Color palette for charts
const CHART_COLORS = [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6'
];

// Format currency
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '$0.00';
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Format date for display (short format)
function formatShortDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Format week label with date range (e.g., "2026-W01" -> "Week 1 (Jan 1-7)")
function formatWeekLabel(period, includeRange = false) {
    const match = period.match(/(\d{4})-W(\d+)/);
    if (match) {
        const year = parseInt(match[1]);
        const weekNum = parseInt(match[2]);
        const weekLabel = `Week ${weekNum}`;

        if (includeRange) {
            // Calculate week start/end dates
            const jan1 = new Date(year, 0, 1);
            const daysToAdd = (weekNum * 7) - jan1.getDay();
            const weekStart = new Date(year, 0, 1 + daysToAdd);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);

            const startStr = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endStr = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `${weekLabel} (${startStr} - ${endStr})`;
        }
        return weekLabel;
    }
    return period;
}

// Get current month's date range
function getCurrentMonthRange() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    return {
        start: `${year}-${String(month).padStart(2, '0')}-01`,
        end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    };
}

// Custom tooltip for pie chart - improved styling
function PieTooltip({ active, payload }) {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="chart-tooltip pie-tooltip">
                <div className="tooltip-header">{data.name}</div>
                <div className="tooltip-row">
                    <span className="tooltip-amount">{formatCurrency(data.total)}</span>
                </div>
                <div className="tooltip-row secondary">
                    <span>{data.percentage}% of total</span>
                </div>
            </div>
        );
    }
    return null;
}

// Custom tooltip for budget vs actual - improved styling
function BudgetTooltip({ active, payload, label }) {
    if (active && payload && payload.length) {
        const budget = payload.find(p => p.dataKey === 'budget')?.value || 0;
        const actual = payload.find(p => p.dataKey === 'actual')?.value || 0;
        const diff = budget - actual;
        const isOver = actual > budget;

        return (
            <div className="chart-tooltip budget-tooltip">
                <div className="tooltip-header">{label}</div>
                <div className="tooltip-row">
                    <span className="tooltip-label">Budget:</span>
                    <span className="tooltip-value">{formatCurrency(budget)}</span>
                </div>
                <div className="tooltip-row">
                    <span className="tooltip-label">Spent:</span>
                    <span className="tooltip-value">{formatCurrency(actual)}</span>
                </div>
                <div className={`tooltip-row summary ${isOver ? 'over' : 'under'}`}>
                    <span>{isOver ? 'Over by:' : 'Remaining:'}</span>
                    <span>{formatCurrency(Math.abs(diff))}</span>
                </div>
            </div>
        );
    }
    return null;
}

// Custom tooltip for daily spending - single value only
function DailyTooltip({ active, payload, label }) {
    if (active && payload && payload.length) {
        return (
            <div className="chart-tooltip daily-tooltip">
                <div className="tooltip-header">{formatShortDate(label)}</div>
                <div className="tooltip-row">
                    <span className="tooltip-label">Spent:</span>
                    <span className="tooltip-value">{formatCurrency(payload[0].value)}</span>
                </div>
            </div>
        );
    }
    return null;
}

// Custom tooltip for weekly expenses
function WeeklyTooltip({ active, payload, label }) {
    if (active && payload && payload.length) {
        return (
            <div className="chart-tooltip weekly-tooltip">
                <div className="tooltip-header">{formatWeekLabel(label, true)}</div>
                <div className="tooltip-row">
                    <span className="tooltip-label">Expenses:&nbsp;</span>
                    <span className="tooltip-value">{formatCurrency(payload[0].value)}</span>
                </div>
            </div>
        );
    }
    return null;
}

// Helper to check if icon is an emoji vs image path
function isEmoji(str) {
    if (!str) return false;
    return !str.startsWith('/') && !str.startsWith('http');
}

// Render icon - handles both emoji and image paths
function IconDisplay({ icon, className = 'icon' }) {
    if (!icon) return null;
    if (isEmoji(icon)) {
        return <span className={`${className} emoji-icon`}>{icon}</span>;
    }
    return <img src={icon} alt="" className={className} />;
}

// Custom legend renderer for pie chart (sorted by value)
function renderPieLegend({ payload }) {
    // Sort by value descending
    const sorted = [...payload].sort((a, b) => b.payload.total - a.payload.total);
    return (
        <ul className="pie-legend">
            {sorted.map((entry, index) => (
                <li key={`legend-${index}`} className="pie-legend-item">
                    <span
                        className="pie-legend-dot"
                        style={{ backgroundColor: entry.color }}
                    />
                    <span className="pie-legend-label">{entry.value}</span>
                </li>
            ))}
        </ul>
    );
}

export default function Reports() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Data states
    const [summary, setSummary] = useState(null);
    const [spendingByCategory, setSpendingByCategory] = useState([]);
    const [dailySpending, setDailySpending] = useState([]);
    const [weeklyExpenses, setWeeklyExpenses] = useState([]);
    const [topExpenses, setTopExpenses] = useState([]);
    const [dashboardData, setDashboardData] = useState(null);

    const dateRange = useMemo(() => getCurrentMonthRange(), []);

    // Fetch all report data
    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                setError(null);

                const [
                    summaryData,
                    categoryData,
                    dailyData,
                    incomeExpenseData,
                    topExpenseData,
                    dashboard
                ] = await Promise.all([
                    api.getReportsSummary(dateRange.start, dateRange.end),
                    api.getSpendingByCategory(dateRange.start, dateRange.end),
                    api.getDailySpending(dateRange.start, dateRange.end),
                    api.getIncomeVsExpenses(dateRange.start, dateRange.end, 'week'),
                    api.getTopExpenses(dateRange.start, dateRange.end, 5),
                    api.getDashboardData()
                ]);

                setSummary(summaryData);
                // Sort spending by category by value descending
                setSpendingByCategory([...categoryData].sort((a, b) => b.total - a.total));
                setDailySpending(dailyData);
                // Transform to weekly expenses only (no income)
                setWeeklyExpenses(incomeExpenseData.map(d => ({
                    period: d.period,
                    expenses: d.expenses
                })));
                setTopExpenses(topExpenseData);
                setDashboardData(dashboard);
            } catch (err) {
                console.error('Error fetching report data:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [dateRange]);

    // Calculate budget totals from dashboard
    const budgetMetrics = useMemo(() => {
        if (!dashboardData) return { totalBudget: 0, totalSpent: 0, remaining: 0 };
        const budgetedCategories = dashboardData.categories.filter(cat => cat.monthlyAmount > 0);
        const totalBudget = budgetedCategories.reduce((sum, cat) => sum + cat.monthlyAmount, 0);
        const totalSpent = budgetedCategories.reduce((sum, cat) => sum + Math.abs(cat.activity), 0);
        return {
            totalBudget,
            totalSpent,
            remaining: totalBudget - totalSpent
        };
    }, [dashboardData]);

    // Prepare budget vs actual data from dashboard
    const budgetVsActual = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.categories
            .filter(cat => cat.monthlyAmount > 0) // Only budgeted categories
            .map(cat => ({
                name: cat.name,
                icon: cat.icon,
                budget: cat.monthlyAmount,
                actual: Math.abs(cat.activity),
                isOverBudget: Math.abs(cat.activity) > cat.monthlyAmount
            }))
            .sort((a, b) => b.actual - a.actual)
            .slice(0, 8); // Top 8 budgeted categories
    }, [dashboardData]);

    if (loading) {
        return (
            <div className="reports-loading">
                <div className="loading-spinner"></div>
                <p>Loading reports...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="reports-error">
                <span>⚠️</span>
                <p>Error loading reports: {error}</p>
            </div>
        );
    }

    return (
        <div className="reports">
            {/* Header */}
            <div className="reports-header">
                <h1>📊 Reports</h1>
                <div className="month-badge">{dateRange.label}</div>
            </div>

            {/* Summary Cards - Replaced income/savings with budget metrics */}
            <div className="summary-cards">
                <div className="summary-card budget-total">
                    <div className="card-icon">🎯</div>
                    <div className="card-content">
                        <div className="card-label">Monthly Budget</div>
                        <div className="card-value">{formatCurrency(budgetMetrics.totalBudget)}</div>
                    </div>
                </div>
                <div className="summary-card expenses">
                    <div className="card-icon">💸</div>
                    <div className="card-content">
                        <div className="card-label">Total Spent</div>
                        <div className="card-value">{formatCurrency(summary?.expenses || 0)}</div>
                    </div>
                </div>
                <div className="summary-card remaining">
                    <div className="card-icon">💰</div>
                    <div className="card-content">
                        <div className="card-label">Budget Remaining</div>
                        <div className={`card-value ${budgetMetrics.remaining >= 0 ? 'positive' : 'negative'}`}>
                            {formatCurrency(budgetMetrics.remaining)}
                        </div>
                    </div>
                </div>
                <div className="summary-card daily-avg">
                    <div className="card-icon">📅</div>
                    <div className="card-content">
                        <div className="card-label">Daily Average</div>
                        <div className="card-value">{formatCurrency(summary?.dailyAverage || 0)}</div>
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="charts-grid">
                {/* Spending by Category - Donut Chart */}
                <div className="chart-card">
                    <h3>Spending by Category</h3>
                    {spendingByCategory.length === 0 ? (
                        <div className="no-data">No spending data for this period</div>
                    ) : (
                        <div className="chart-container pie-container">
                            <ResponsiveContainer width="100%" height={280}>
                                <PieChart>
                                    <Pie
                                        data={spendingByCategory.slice(0, 8)}
                                        cx="40%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={2}
                                        dataKey="total"
                                        nameKey="name"
                                    >
                                        {spendingByCategory.slice(0, 8).map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<PieTooltip />} />
                                    <Legend
                                        layout="vertical"
                                        align="right"
                                        verticalAlign="middle"
                                        content={renderPieLegend}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Budget vs Actual - Horizontal Bar */}
                <div className="chart-card">
                    <h3>Budget vs Actual</h3>
                    {budgetVsActual.length === 0 ? (
                        <div className="no-data">No budgeted categories</div>
                    ) : (
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart
                                    data={budgetVsActual}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                    <XAxis type="number" tickFormatter={(v) => `$${v}`} />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        width={75}
                                        tick={{ fontSize: 12 }}
                                    />
                                    <Tooltip content={<BudgetTooltip />} />
                                    <Bar dataKey="budget" name="Budget" fill="#94a3b8" radius={[0, 4, 4, 0]} />
                                    <Bar
                                        dataKey="actual"
                                        name="Actual"
                                        radius={[0, 4, 4, 0]}
                                        fill="#6366f1"
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Daily Spending - Area Chart (no line overlay to avoid duplicate) */}
                <div className="chart-card">
                    <h3>Daily Spending</h3>
                    {dailySpending.length === 0 ? (
                        <div className="no-data">No spending data</div>
                    ) : (
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={280}>
                                <AreaChart data={dailySpending} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatShortDate}
                                        tick={{ fontSize: 10 }}
                                        interval="preserveStartEnd"
                                    />
                                    <YAxis tickFormatter={(v) => `$${v}`} />
                                    <Tooltip content={<DailyTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="spending"
                                        stroke="#f97316"
                                        strokeWidth={2}
                                        fill="#fed7aa"
                                        name="Spending"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Weekly Expenses - Simple Bar Chart (no income) */}
                <div className="chart-card">
                    <h3>Weekly Expenses</h3>
                    {weeklyExpenses.length === 0 ? (
                        <div className="no-data">No data for this period</div>
                    ) : (
                        <div className="chart-container">
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={weeklyExpenses} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                    <XAxis
                                        dataKey="period"
                                        tick={{ fontSize: 11 }}
                                        tickFormatter={formatWeekLabel}
                                    />
                                    <YAxis tickFormatter={(v) => `$${v}`} />
                                    <Tooltip content={<WeeklyTooltip />} />
                                    <Bar
                                        dataKey="expenses"
                                        name="Expenses"
                                        fill="#f43f5e"
                                        radius={[4, 4, 0, 0]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>

            {/* Top Expenses Table */}
            <div className="chart-card top-expenses-card">
                <h3>Top Expenses</h3>
                {topExpenses.length === 0 ? (
                    <div className="no-data">No expenses for this period</div>
                ) : (
                    <table className="top-expenses-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Category</th>
                                <th className="amount-col">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topExpenses.map((expense) => (
                                <tr key={expense.id}>
                                    <td className="date-cell">{formatShortDate(expense.date)}</td>
                                    <td className="desc-cell">{expense.description || '—'}</td>
                                    <td className="category-cell">
                                        <IconDisplay icon={expense.icon} className="category-icon" />
                                        <span>{expense.category}</span>
                                    </td>
                                    <td className="amount-cell">{formatCurrency(expense.amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Coming Soon Banner */}
            <div className="coming-soon-banner">
                <div className="banner-icon">🚀</div>
                <div className="banner-content">
                    <div className="banner-title">More reports coming soon!</div>
                    <div className="banner-text">
                        As your data grows, you'll unlock historical trends, spending forecasts,
                        and AI-powered budget insights.
                    </div>
                </div>
            </div>
        </div>
    );
}
