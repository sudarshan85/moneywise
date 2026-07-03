import { useEffect, useMemo, useState } from 'react';
import {
    ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import * as api from '../api/client.js';
import { IconDisplay } from '../components/IconDisplay.jsx';
import { formatCurrency, formatShortDate, formatMonthLabel, formatMonthShort, formatYMD } from '../utils/format.js';
import './Reports.css';

// ==================== chart tokens ====================
// Categorical slots follow the validated fixed order (dataviz palette);
// semantic hues reuse the app's income/expense colors.
const CHART = {
    series: ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'],
    spend: '#C77800',
    pace: '#94A3B8',
    income: '#22C55E',
    expense: '#EF4444',
    netWorth: '#2a78d6',
    other: '#94A3B8',
    grid: '#E2E8F0',
    axis: '#94A3B8',
};

const TOOLTIP_STYLE = {
    borderRadius: 8,
    border: '1px solid #E2E8F0',
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
    fontSize: 13,
};

const compactDollars = (v) =>
    Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`;

// ==================== month helpers ====================
function currentYM() {
    return formatYMD(new Date()).slice(0, 7);
}

function shiftYM(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    return formatYMD(new Date(y, m - 1 + delta, 1)).slice(0, 7);
}

function ymRange(ym) {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, '0')}` };
}

// ==================== small components ====================
function StatTile({ label, value, hint, tone }) {
    return (
        <div className={`report-tile ${tone || ''}`}>
            <div className="tile-label">{label}</div>
            <div className="tile-value">{value}</div>
            {hint && <div className="tile-hint">{hint}</div>}
        </div>
    );
}

function SectionTitle({ children, hint }) {
    return (
        <div className="report-section-title">
            <h3>{children}</h3>
            {hint && <span className="section-hint">{hint}</span>}
        </div>
    );
}

// Forecast meter: solid = spent, tinted = projected, notch = budget; red when over
function ForecastRow({ cat }) {
    const budget = cat.monthlyAmount;
    const scale = Math.max(budget, cat.projected, 1);
    const spentPct = Math.min(100, ((cat.spentSoFar + cat.pending) / scale) * 100);
    const projPct = Math.min(100, (cat.projected / scale) * 100);
    const budgetPct = Math.min(100, (budget / scale) * 100);
    const isOver = cat.status === 'over';
    const isDue = cat.status === 'due';
    const hue = isOver ? CHART.expense : '#F5A623';

    return (
        <div className="forecast-row">
            <div className="forecast-row-header">
                <div className="forecast-name">
                    <IconDisplay icon={cat.icon} fallback="📦" className="forecast-icon" />
                    <span>{cat.name}</span>
                    {cat.kind === 'fixed' && <span className="chip chip-fixed">fixed</span>}
                    {isDue && <span className="chip chip-due">due soon</span>}
                    {isOver && <span className="chip chip-over">over</span>}
                </div>
                <div className="forecast-numbers">
                    <span className="forecast-projected">{formatCurrency(cat.projected)}</span>
                    <span className="forecast-of"> of {formatCurrency(budget)}</span>
                </div>
            </div>
            <div
                className="forecast-meter"
                role="img"
                aria-label={`${cat.name}: spent ${formatCurrency(cat.spentSoFar)}, projected ${formatCurrency(cat.projected)} of ${formatCurrency(budget)} budget`}
            >
                <div className="meter-projected" style={{ width: `${projPct}%`, background: hue }} />
                <div className="meter-spent" style={{ width: `${spentPct}%`, background: hue }} />
                {budgetPct < 100 && <div className="meter-budget-tick" style={{ left: `${budgetPct}%` }} />}
            </div>
        </div>
    );
}

// ==================== main page ====================
export default function Reports() {
    const thisMonth = currentYM();
    const [month, setMonth] = useState(thisMonth);
    const [data, setData] = useState(null);
    const [netWorth, setNetWorth] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const isCurrentMonth = month === thisMonth;

    // Net worth is not month-scoped; load once
    useEffect(() => {
        api.getMonthlyNetWorth(12).then(setNetWorth).catch(() => {});
    }, []);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError(null);
            try {
                const { start, end } = ymRange(month);
                const prevRange = ymRange(shiftYM(month, -1));
                const trendStart = `${shiftYM(month, -5)}-01`;

                const [forecast, spending, prevSpending, daily, topExpenses, monthlySpending, trend, summary] =
                    await Promise.all([
                        api.getForecast(month),
                        api.getSpendingByCategory(start, end),
                        api.getSpendingByCategory(prevRange.start, prevRange.end),
                        api.getDailySpending(start, end, true),
                        api.getTopExpenses(start, end, 5),
                        api.getMonthlySpending(trendStart, end),
                        api.getCategoryTrend(trendStart, end, 5, true),
                        api.getReportsSummary(start, end),
                    ]);
                if (!cancelled) {
                    setData({ forecast, spending, prevSpending, daily, topExpenses, monthlySpending, trend, summary });
                }
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [month]);

    // Cumulative spending vs even budget pace
    const cumulativeData = useMemo(() => {
        if (!data) return [];
        const { forecast, daily } = data;
        const today = formatYMD(new Date());
        let running = 0;
        return daily.map((d, i) => {
            running += d.spending;
            const point = {
                date: d.date,
                pace: Math.round((forecast.budgetTotal * ((i + 1) / daily.length)) * 100) / 100,
            };
            if (!isCurrentMonth || d.date <= today) {
                point.spent = Math.round(running * 100) / 100;
            }
            return point;
        });
    }, [data, isCurrentMonth]);

    // Donut: top 8 + Other
    const donutData = useMemo(() => {
        if (!data) return [];
        const top = data.spending.slice(0, 8).map((c) => ({ name: c.name, value: c.total }));
        const rest = data.spending.slice(8).reduce((s, c) => s + c.total, 0);
        if (rest > 0) top.push({ name: 'Other', value: Math.round(rest * 100) / 100 });
        return top;
    }, [data]);

    // Month-over-month comparison, biggest movers first
    const momRows = useMemo(() => {
        if (!data) return [];
        const prevMap = Object.fromEntries(data.prevSpending.map((c) => [c.name, c.total]));
        const currMap = Object.fromEntries(data.spending.map((c) => [c.name, c.total]));
        const names = new Set([...Object.keys(prevMap), ...Object.keys(currMap)]);
        return [...names]
            .map((name) => {
                const prev = prevMap[name] || 0;
                const curr = currMap[name] || 0;
                return { name, prev, curr, delta: curr - prev };
            })
            .filter((r) => Math.abs(r.delta) >= 1)
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            .slice(0, 10);
    }, [data]);

    const trendData = useMemo(() => {
        if (!data) return { categories: [], data: [] };
        return {
            categories: data.trend.categories,
            data: data.trend.data.map((row) => ({ ...row, label: formatMonthShort(row.period) })),
        };
    }, [data]);

    if (loading && !data) {
        return (
            <div className="reports-page">
                <div className="reports-loading">
                    <div className="loading-spinner" />
                    <p>Loading reports…</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="reports-page">
                <div className="reports-error">⚠️ {error}</div>
            </div>
        );
    }

    const { forecast, summary, topExpenses } = data;
    const budgetedForecast = forecast.categories.filter((c) => c.monthlyAmount > 0);
    const spentDelta = isCurrentMonth ? forecast.spentSoFar - forecast.budgetToDate : null;
    const hasActivity = summary.expenses > 0 || summary.income > 0;

    return (
        <div className={`reports-page ${loading ? 'is-refreshing' : ''}`}>
            {/* Header with month navigation */}
            <div className="reports-header">
                <h2>📈 Reports</h2>
                <div className="month-picker">
                    <button
                        className="month-nav"
                        onClick={() => setMonth(shiftYM(month, -1))}
                        aria-label="Previous month"
                    >
                        ‹
                    </button>
                    <span className="month-label">{formatMonthLabel(month)}</span>
                    <button
                        className="month-nav"
                        onClick={() => setMonth(shiftYM(month, 1))}
                        disabled={isCurrentMonth}
                        aria-label="Next month"
                    >
                        ›
                    </button>
                    {!isCurrentMonth && (
                        <button className="btn btn-secondary btn-sm month-today" onClick={() => setMonth(thisMonth)}>
                            Back to today
                        </button>
                    )}
                </div>
            </div>

            {!hasActivity ? (
                <div className="empty-state card">
                    <div className="emoji">🌱</div>
                    <p>No activity in {formatMonthLabel(month)}</p>
                </div>
            ) : (
                <>
                    {/* ===== Daily pulse (current) / Month in review (past) ===== */}
                    {isCurrentMonth ? (
                        <div className="pulse-grid">
                            <StatTile
                                label="Spent so far (budgeted)"
                                value={formatCurrency(forecast.spentSoFar)}
                                hint={
                                    spentDelta > 0
                                        ? `${formatCurrency(spentDelta)} ahead of budget pace`
                                        : `${formatCurrency(Math.abs(spentDelta))} under budget pace`
                                }
                                tone={spentDelta > 0 ? 'warn' : 'good'}
                            />
                            <StatTile
                                label="Projected month total"
                                value={formatCurrency(forecast.forecastTotal)}
                                hint={`budget ${formatCurrency(forecast.budgetTotal)}`}
                                tone={forecast.forecastTotal > forecast.budgetTotal ? 'warn' : 'good'}
                            />
                            <StatTile
                                label="Safe to spend"
                                value={`${formatCurrency(forecast.safeToSpendPerDay)}/day`}
                                hint={`for the next ${forecast.daysRemaining} days`}
                            />
                            <StatTile
                                label="Unbudgeted spending"
                                value={formatCurrency(forecast.unbudgeted.spentSoFar)}
                                hint="investments, one-offs, no-budget categories"
                            />
                        </div>
                    ) : (
                        <div className="pulse-grid">
                            <StatTile
                                label="Spent (budgeted)"
                                value={formatCurrency(forecast.spentSoFar)}
                                hint={`budget was ${formatCurrency(forecast.budgetTotal)}`}
                                tone={forecast.spentSoFar > forecast.budgetTotal ? 'warn' : 'good'}
                            />
                            <StatTile label="Income" value={formatCurrency(summary.income)} />
                            <StatTile
                                label="Net savings"
                                value={formatCurrency(summary.netSavings)}
                                tone={summary.netSavings >= 0 ? 'good' : 'warn'}
                            />
                            <StatTile label="Daily average spend" value={formatCurrency(summary.dailyAverage)} />
                        </div>
                    )}

                    {/* ===== Cumulative spending vs budget pace ===== */}
                    <div className="card chart-card chart-card-wide">
                        <SectionTitle hint={isCurrentMonth ? 'stay under the gray line and the month takes care of itself' : null}>
                            Spending pace — {formatMonthLabel(month)}
                        </SectionTitle>
                        <ResponsiveContainer width="100%" height={240}>
                            <LineChart data={cumulativeData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                                <CartesianGrid stroke={CHART.grid} vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(d) => String(Number(d.slice(8)))}
                                    tick={{ fontSize: 12, fill: CHART.axis }}
                                    tickLine={false}
                                    axisLine={{ stroke: '#CBD5E1' }}
                                    interval={4}
                                />
                                <YAxis
                                    tickFormatter={compactDollars}
                                    tick={{ fontSize: 12, fill: CHART.axis }}
                                    tickLine={false}
                                    axisLine={false}
                                    width={52}
                                />
                                <Tooltip
                                    contentStyle={TOOLTIP_STYLE}
                                    formatter={(v, name) => [formatCurrency(v), name === 'spent' ? 'Spent (cumulative)' : 'Even budget pace']}
                                    labelFormatter={formatShortDate}
                                />
                                <Legend
                                    iconType="plainline"
                                    formatter={(v) => (v === 'spent' ? 'Spent (cumulative)' : 'Even budget pace')}
                                />
                                <Line type="monotone" dataKey="pace" stroke={CHART.pace} strokeWidth={2} dot={false} isAnimationActive={false} />
                                <Line
                                    type="monotone"
                                    dataKey="spent"
                                    stroke={CHART.spend}
                                    strokeWidth={2}
                                    dot={false}
                                    isAnimationActive={false}
                                    activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* ===== Forecast by category (current month only) ===== */}
                    {isCurrentMonth && budgetedForecast.length > 0 && (
                        <div className="card chart-card chart-card-wide">
                            <SectionTitle hint="solid = spent, tinted = projected from history + current pace, notch = budget">
                                Category forecast
                            </SectionTitle>
                            <div className="forecast-list">
                                {budgetedForecast.map((cat) => <ForecastRow key={cat.id} cat={cat} />)}
                            </div>
                            {forecast.unbudgeted.spentSoFar > 0 && (
                                <div className="forecast-unbudgeted">
                                    Unbudgeted categories add {formatCurrency(forecast.unbudgeted.spentSoFar)} spent
                                    ({formatCurrency(forecast.unbudgeted.projected)} projected) this month.
                                </div>
                            )}
                        </div>
                    )}

                    {/* ===== Trends ===== */}
                    <div className="charts-grid">
                        <div className="card chart-card">
                            <SectionTitle hint="budgeted categories">Top categories — last 6 months</SectionTitle>
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={trendData.data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                                    <XAxis dataKey="label" interval={0} tick={{ fontSize: 12, fill: CHART.axis }} tickLine={false} axisLine={{ stroke: '#CBD5E1' }} />
                                    <YAxis tickFormatter={compactDollars} tick={{ fontSize: 12, fill: CHART.axis }} tickLine={false} axisLine={false} width={52} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                                    <Legend iconType="plainline" />
                                    {trendData.categories.map((cat, i) => (
                                        <Line
                                            key={cat.id}
                                            type="monotone"
                                            dataKey={cat.name}
                                            stroke={CHART.series[i % CHART.series.length]}
                                            strokeWidth={2}
                                            dot={false}
                                            isAnimationActive={false}
                                            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="card chart-card">
                            <SectionTitle hint="unbudgeted = investments, one-offs">Monthly spending — last 6 months</SectionTitle>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart
                                    data={data.monthlySpending.map((r) => ({ ...r, label: formatMonthShort(r.month) }))}
                                    margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
                                >
                                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                                    <XAxis dataKey="label" interval={0} tick={{ fontSize: 12, fill: CHART.axis }} tickLine={false} axisLine={{ stroke: '#CBD5E1' }} />
                                    <YAxis tickFormatter={compactDollars} tick={{ fontSize: 12, fill: CHART.axis }} tickLine={false} axisLine={false} width={52} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [formatCurrency(v), name === 'budgeted' ? 'Budgeted' : 'Unbudgeted']} />
                                    <Legend formatter={(v) => (v === 'budgeted' ? 'Budgeted' : 'Unbudgeted')} />
                                    <Bar dataKey="budgeted" stackId="spend" fill={CHART.spend} maxBarSize={24} isAnimationActive={false} />
                                    <Bar dataKey="unbudgeted" stackId="spend" fill={CHART.pace} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="card chart-card">
                            <SectionTitle hint={`vs ${formatMonthLabel(shiftYM(month, -1))}`}>Biggest movers</SectionTitle>
                            {momRows.length === 0 ? (
                                <p className="text-muted">No meaningful changes from last month.</p>
                            ) : (
                                <table className="mom-table">
                                    <thead>
                                        <tr>
                                            <th>Category</th>
                                            <th className="text-right">Last month</th>
                                            <th className="text-right">This month</th>
                                            <th className="text-right">Change</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {momRows.map((row) => (
                                            <tr key={row.name}>
                                                <td>{row.name}</td>
                                                <td className="text-right amount">{formatCurrency(row.prev)}</td>
                                                <td className="text-right amount">{formatCurrency(row.curr)}</td>
                                                <td className={`text-right amount ${row.delta > 0 ? 'delta-up' : 'delta-down'}`}>
                                                    {formatCurrency(row.delta, { sign: true })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="card chart-card">
                            <SectionTitle hint="all accounts, including investments and loans">Net worth — last 12 months</SectionTitle>
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart
                                    data={netWorth.map((r) => ({ ...r, label: formatMonthShort(r.month) }))}
                                    margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
                                >
                                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                                    <XAxis dataKey="label" interval={0} tick={{ fontSize: 12, fill: CHART.axis }} tickLine={false} axisLine={{ stroke: '#CBD5E1' }} />
                                    <YAxis
                                        tickFormatter={compactDollars}
                                        tick={{ fontSize: 12, fill: CHART.axis }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={60}
                                        domain={['auto', 'auto']}
                                    />
                                    <Tooltip
                                        contentStyle={TOOLTIP_STYLE}
                                        formatter={(v) => [formatCurrency(v), 'Net worth']}
                                        labelFormatter={(l, p) => (p?.[0] ? formatMonthLabel(p[0].payload.month) : l)}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="balance"
                                        stroke={CHART.netWorth}
                                        strokeWidth={2}
                                        dot={{ r: 3, strokeWidth: 2, stroke: '#fff' }}
                                        isAnimationActive={false}
                                        activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* ===== Month detail: donut + top expenses ===== */}
                    <div className="charts-grid">
                        <div className="card chart-card">
                            <SectionTitle>Where the money went — {formatMonthLabel(month)}</SectionTitle>
                            <div className="donut-layout">
                                <ResponsiveContainer width="100%" height={240}>
                                    <PieChart>
                                        <Pie
                                            data={donutData}
                                            dataKey="value"
                                            nameKey="name"
                                            innerRadius={60}
                                            outerRadius={95}
                                            paddingAngle={1}
                                            stroke="#fff"
                                            strokeWidth={2}
                                            isAnimationActive={false}
                                        >
                                            {donutData.map((entry, i) => (
                                                <Cell
                                                    key={entry.name}
                                                    fill={entry.name === 'Other' ? CHART.other : CHART.series[i % CHART.series.length]}
                                                />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [formatCurrency(v), name]} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <ul className="donut-legend">
                                    {donutData.map((entry, i) => (
                                        <li key={entry.name}>
                                            <span
                                                className="legend-swatch"
                                                style={{ background: entry.name === 'Other' ? CHART.other : CHART.series[i % CHART.series.length] }}
                                            />
                                            <span className="legend-name">{entry.name}</span>
                                            <span className="legend-value">{formatCurrency(entry.value)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        <div className="card chart-card">
                            <SectionTitle>Largest expenses — {formatMonthLabel(month)}</SectionTitle>
                            {topExpenses.length === 0 ? (
                                <p className="text-muted">No expenses this month.</p>
                            ) : (
                                <table className="mom-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Memo</th>
                                            <th>Category</th>
                                            <th className="text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {topExpenses.map((e) => (
                                            <tr key={e.id}>
                                                <td>{formatShortDate(e.date)}</td>
                                                <td className="memo-cell">{e.description || '—'}</td>
                                                <td>{e.category}</td>
                                                <td className="text-right amount">{formatCurrency(e.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
