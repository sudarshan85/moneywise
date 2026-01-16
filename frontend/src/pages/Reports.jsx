import { useEffect, useState, useMemo } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    LineChart, Line, AreaChart, Area
} from 'recharts';
import * as api from '../api/client.js';
import './Reports.css';

// Color palette for charts
// Custom Color Palette (Distinct, avoiding standard Red/Green for categories)
const COLORS = [
    '#3b82f6', // Blue
    '#8b5cf6', // Violet
    '#f59e0b', // Amber
    '#06b6d4', // Cyan
    '#ec4899', // Pink
    '#10b981', // Emerald (distinct from pure green)
    '#6366f1', // Indigo
    '#f97316', // Orange
    '#14b8a6', // Teal
    '#d946ef'  // Fuchsia
];

// Time period options
const TIME_PERIODS = [
    { id: 'this-month', label: 'This Month' },
    { id: 'last-month', label: 'Last Month' },
    { id: 'last-3-months', label: 'Last 3 Months' },
    { id: 'last-6-months', label: 'Last 6 Months' },
    { id: 'this-year', label: 'This Year' },
];

// Calculate date range from period ID
function getDateRange(periodId) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    let start, end;

    switch (periodId) {
        case 'last-month': {
            const lastMonth = month === 0 ? 11 : month - 1;
            const lastMonthYear = month === 0 ? year - 1 : year;
            const lastDay = new Date(lastMonthYear, lastMonth + 1, 0).getDate();
            start = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-01`;
            end = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            break;
        }
        case 'last-3-months': {
            const threeMonthsAgo = new Date(year, month - 2, 1);
            const lastDay = new Date(year, month + 1, 0).getDate();
            start = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;
            end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            break;
        }
        case 'last-6-months': {
            const sixMonthsAgo = new Date(year, month - 5, 1);
            const lastDay = new Date(year, month + 1, 0).getDate();
            start = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;
            end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            break;
        }
        case 'this-year': {
            const lastDay = new Date(year, month + 1, 0).getDate();
            start = `${year}-01-01`;
            end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            break;
        }
        case 'this-month':
        default: {
            const lastDay = new Date(year, month + 1, 0).getDate();
            start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            break;
        }
    }

    return { start, end };
}

// Format currency
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '—';
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Format month label (2026-01 -> Jan 2026)
function formatMonthLabel(period) {
    if (!period) return '';
    const [year, month] = period.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Custom tooltip for pie chart
function PieTooltip({ active, payload }) {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="chart-tooltip">
                <p className="tooltip-label">{data.name}</p>
                <p className="tooltip-value">{formatCurrency(data.total)}</p>
                <p className="tooltip-percent">{data.percentage}%</p>
            </div>
        );
    }
    return null;
}

// Custom tooltip for bar/line charts
// Custom tooltip for bar/line charts
function ChartTooltip({ active, payload, label }) {
    if (active && payload && payload.length) {
        return (
            <div className="chart-tooltip">
                <p className="tooltip-label">{formatMonthLabel(label)}</p>
                {payload.map((entry, index) => (
                    <p key={index} style={{ color: entry.color }}>
                        {entry.name}: {formatCurrency(entry.value)}
                    </p>
                ))}
            </div>
        );
    }
    return null;
}

// Custom tooltip for Line Chart (Simplified: only shows hovered line)
function LineChartTooltip({ active, payload, label }) {
    if (active && payload && payload.length) {
        // Find the specific item being hovered if possible (Recharts passes all by default for shared tooltip)
        // But for clarity, let's show all lines but highlight the values
        return (
            <div className="chart-tooltip">
                <p className="tooltip-label">{formatMonthLabel(label)}</p>
                {payload.map((entry, index) => (
                    <p key={index} style={{ color: entry.color }}>
                        {entry.name}: {formatCurrency(entry.value)}
                    </p>
                ))}
            </div>
        );
    }
    return null;
}

export default function Reports() {
    const [period, setPeriod] = useState('this-month');
    const [summary, setSummary] = useState(null);
    const [spendingByCategory, setSpendingByCategory] = useState([]);
    const [incomeVsExpenses, setIncomeVsExpenses] = useState([]);
    const [categoryTrend, setCategoryTrend] = useState({ categories: [], data: [] });
    const [balanceHistory, setBalanceHistory] = useState([]);
    const [topExpenses, setTopExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch all reports data when period changes
    useEffect(() => {
        async function fetchReports() {
            try {
                setLoading(true);
                setError(null);
                const { start, end } = getDateRange(period);

                const [summaryData, categoryData, incomeExpenseData, trendData, balanceData, expensesList] = await Promise.all([
                    api.getReportsSummary(start, end),
                    api.getSpendingByCategory(start, end),
                    api.getIncomeVsExpenses(start, end),
                    api.getCategoryTrend(start, end),
                    api.getBalanceHistory(start, end),
                    api.getTopExpenses(start, end, 10)
                ]);

                setSummary(summaryData);
                setSpendingByCategory(categoryData);
                setIncomeVsExpenses(incomeExpenseData);
                setCategoryTrend(trendData);
                setBalanceHistory(balanceData);
                setTopExpenses(expensesList);
            } catch (err) {
                console.error('Failed to fetch reports:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchReports();
    }, [period]);

    // Get category names for line chart
    const categoryNames = useMemo(() => {
        return categoryTrend.categories.map(c => c.name);
    }, [categoryTrend.categories]);

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
            {/* Header with Time Period Selector (No Title) */}
            <div className="reports-header right-aligned">
                <select
                    className="period-select"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                >
                    {TIME_PERIODS.map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                </select>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="summary-cards">
                    <div className="summary-card income">
                        <div className="card-label">Total Income</div>
                        <div className="card-value">{formatCurrency(summary.income)}</div>
                    </div>
                    <div className="summary-card expenses">
                        <div className="card-label">Total Expenses</div>
                        <div className="card-value">{formatCurrency(summary.expenses)}</div>
                    </div>
                    <div className={`summary-card net ${summary.netSavings >= 0 ? 'positive' : 'negative'}`}>
                        <div className="card-label">Net Savings</div>
                        <div className="card-value">
                            {summary.netSavings >= 0 ? '+' : ''}{formatCurrency(summary.netSavings)}
                        </div>
                    </div>

                </div>
            )}

            {/* Row 1: Breakdown & Trends */}
            <div className="charts-row">
                {/* Spending by Category Donut */}
                <div className="chart-card">
                    <h3>Spending by Category</h3>
                    {spendingByCategory.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={spendingByCategory}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={120}
                                    paddingAngle={2}
                                    dataKey="total"
                                    nameKey="name"
                                >
                                    {spendingByCategory.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip content={<PieTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="no-data">No spending data for this period</div>
                    )}
                </div>

                {/* Category Trend */}
                <div className="chart-card">
                    <h3>Category Spending Trend</h3>
                    {categoryTrend.data.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={categoryTrend.data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis
                                    dataKey="period"
                                    tickFormatter={formatMonthLabel}
                                    stroke="#9ca3af"
                                />
                                <YAxis
                                    tickFormatter={(v) => `$${v}`}
                                    stroke="#9ca3af"
                                />
                                <Tooltip content={<LineChartTooltip />} shared={false} />
                                <Legend />
                                {categoryNames.map((name, index) => (
                                    <Line
                                        key={name}
                                        type="monotone"
                                        dataKey={name}
                                        stroke={COLORS[index % COLORS.length]}
                                        strokeWidth={2}
                                        dot={{ r: 4 }}
                                        activeDot={{ r: 6 }}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="no-data">No trend data for this period</div>
                    )}
                </div>
            </div>

            {/* Row 2: Income/Expense & More Insights */}
            <div className="charts-row">
                {/* Income vs Expenses */}
                <div className="chart-card">
                    <h3>Income vs. Expenses</h3>
                    {incomeVsExpenses.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={incomeVsExpenses}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis
                                    dataKey="period"
                                    tickFormatter={formatMonthLabel}
                                    stroke="#9ca3af"
                                />
                                <YAxis
                                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                                    stroke="#9ca3af"
                                />
                                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }} />
                                <Bar dataKey="income" name="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="no-data">No data for this period</div>
                    )}
                </div>

                {/* More Insights Placeholder */}
                <div className="chart-card coming-soon-card">
                    <h3>More Insights</h3>
                    <div className="coming-soon-content">
                        <p>More detailed reports and analytics will become available as you collect more financial data over time.</p>
                        <span className="coming-soon-icon">📈</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
