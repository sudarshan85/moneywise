import express from 'express';
import db from '../db/database.js';
import { formatLocalDate, localToday, currentYearMonth, monthRange } from '../utils/dates.js';

const router = express.Router();

// Helper: Parse date range from query params
function getDateRange(req) {
    const { start, end } = req.query;
    if (!start || !end) {
        return monthRange(currentYearMonth());
    }
    return { start, end };
}

// Helper: iterate YYYY-MM-DD strings from start to end inclusive (local-safe)
function eachDay(start, end) {
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    const days = [];
    const cur = new Date(sy, sm - 1, sd);
    const last = new Date(ey, em - 1, ed);
    while (cur <= last) {
        days.push(formatLocalDate(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return days;
}

// Helper: shift a YYYY-MM month by delta months
function shiftMonth(yearMonth, delta) {
    const [y, m] = yearMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Helper: median of a non-empty numeric array
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Helper: mean with min+max dropped when there are enough samples
function trimmedMean(values) {
    if (values.length === 0) return 0;
    let pool = values;
    if (values.length >= 4) {
        const sorted = [...values].sort((a, b) => a - b);
        pool = sorted.slice(1, -1);
    }
    return pool.reduce((s, v) => s + v, 0) / pool.length;
}

const round2 = (n) => Math.round(n * 100) / 100;

// GET /api/reports/summary - Summary metrics for date range
router.get('/summary', (req, res) => {
    try {
        const { start, end } = getDateRange(req);

        // Get total income (positive transactions, excluding transfers)
        const incomeResult = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.date >= ? AND t.date <= ?
            AND t.status = 'settled'
            AND t.amount > 0
            AND c.is_system = 0
        `).get(start, end);

        // Get total expenses (negative transactions, excluding transfers)
        const expensesResult = db.prepare(`
            SELECT COALESCE(SUM(ABS(amount)), 0) as total
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.date >= ? AND t.date <= ?
            AND t.status = 'settled'
            AND t.amount < 0
            AND c.is_system = 0
        `).get(start, end);

        // Calculate days in range for daily average
        const startDate = new Date(start);
        const endDate = new Date(end);
        const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

        const income = Math.round(incomeResult.total * 100) / 100;
        const expenses = Math.round(expensesResult.total * 100) / 100;
        const netSavings = Math.round((income - expenses) * 100) / 100;
        const dailyAverage = days > 0 ? Math.round((expenses / days) * 100) / 100 : 0;

        res.json({
            income,
            expenses,
            netSavings,
            dailyAverage,
            dateRange: { start, end, days }
        });
    } catch (error) {
        console.error('Error fetching reports summary:', error);
        res.status(500).json({ error: 'Failed to fetch reports summary' });
    }
});

// GET /api/reports/spending-by-category - Breakdown of spending by category
router.get('/spending-by-category', (req, res) => {
    try {
        const { start, end } = getDateRange(req);

        // Get spending per category (only expenses, exclude system categories)
        const categories = db.prepare(`
            SELECT 
                c.id as category_id,
                c.name,
                c.icon,
                COALESCE(SUM(ABS(t.amount)), 0) as total
            FROM categories c
            LEFT JOIN transactions t ON t.category_id = c.id
                AND t.date >= ? AND t.date <= ?
                AND t.status = 'settled'
                AND t.amount < 0
            WHERE c.is_system = 0 AND c.is_hidden = 0
            GROUP BY c.id
            HAVING total > 0
            ORDER BY total DESC
        `).all(start, end);

        // Calculate total for percentages
        const grandTotal = categories.reduce((sum, c) => sum + c.total, 0);

        const result = categories.map(c => ({
            category_id: c.category_id,
            name: c.name,
            icon: c.icon,
            total: Math.round(c.total * 100) / 100,
            percentage: grandTotal > 0 ? Math.round((c.total / grandTotal) * 1000) / 10 : 0
        }));

        res.json(result);
    } catch (error) {
        console.error('Error fetching spending by category:', error);
        res.status(500).json({ error: 'Failed to fetch spending by category' });
    }
});

// GET /api/reports/income-vs-expenses - Monthly comparison
router.get('/income-vs-expenses', (req, res) => {
    try {
        const { start, end } = getDateRange(req);
        const groupBy = req.query.groupBy || 'month'; // month or week

        let periodFormat;
        if (groupBy === 'week') {
            periodFormat = "strftime('%Y-W%W', date)";
        } else {
            periodFormat = "strftime('%Y-%m', date)";
        }

        // Get income by period
        const incomeData = db.prepare(`
            SELECT 
                ${periodFormat} as period,
                COALESCE(SUM(amount), 0) as income
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.date >= ? AND t.date <= ?
            AND t.status = 'settled'
            AND t.amount > 0
            AND c.is_system = 0
            GROUP BY period
            ORDER BY period
        `).all(start, end);

        // Get expenses by period
        const expensesData = db.prepare(`
            SELECT 
                ${periodFormat} as period,
                COALESCE(SUM(ABS(amount)), 0) as expenses
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.date >= ? AND t.date <= ?
            AND t.status = 'settled'
            AND t.amount < 0
            AND c.is_system = 0
            GROUP BY period
            ORDER BY period
        `).all(start, end);

        // Merge income and expenses data
        const periods = new Set([
            ...incomeData.map(d => d.period),
            ...expensesData.map(d => d.period)
        ]);

        const incomeMap = Object.fromEntries(incomeData.map(d => [d.period, d.income]));
        const expensesMap = Object.fromEntries(expensesData.map(d => [d.period, d.expenses]));

        const result = Array.from(periods).sort().map(period => ({
            period,
            income: Math.round((incomeMap[period] || 0) * 100) / 100,
            expenses: Math.round((expensesMap[period] || 0) * 100) / 100
        }));

        res.json(result);
    } catch (error) {
        console.error('Error fetching income vs expenses:', error);
        res.status(500).json({ error: 'Failed to fetch income vs expenses' });
    }
});

// GET /api/reports/category-trend - Spending trend by top categories over time
router.get('/category-trend', (req, res) => {
    try {
        const { start, end } = getDateRange(req);
        const limit = parseInt(req.query.limit) || 5;
        const budgetedOnly = req.query.budgetedOnly === 'true';

        // Get top N categories by total spending in this range
        const topCategories = db.prepare(`
            SELECT
                c.id,
                c.name,
                c.icon,
                COALESCE(SUM(ABS(t.amount)), 0) as total
            FROM categories c
            JOIN transactions t ON t.category_id = c.id
            WHERE t.date >= ? AND t.date <= ?
            AND t.status = 'settled'
            AND t.amount < 0
            AND c.is_system = 0 AND c.is_hidden = 0
            ${budgetedOnly ? 'AND c.monthly_amount > 0' : ''}
            GROUP BY c.id
            ORDER BY total DESC
            LIMIT ?
        `).all(start, end, limit);

        if (topCategories.length === 0) {
            return res.json({ categories: [], data: [] });
        }

        const categoryIds = topCategories.map(c => c.id);
        const placeholders = categoryIds.map(() => '?').join(',');

        // Get monthly spending for each category
        const trendData = db.prepare(`
            SELECT 
                strftime('%Y-%m', t.date) as period,
                t.category_id,
                COALESCE(SUM(ABS(t.amount)), 0) as total
            FROM transactions t
            WHERE t.date >= ? AND t.date <= ?
            AND t.status = 'settled'
            AND t.amount < 0
            AND t.category_id IN (${placeholders})
            GROUP BY period, t.category_id
            ORDER BY period
        `).all(start, end, ...categoryIds);

        // Get all periods
        const allPeriods = [...new Set(trendData.map(d => d.period))].sort();

        // Build data array with all categories per period
        const data = allPeriods.map(period => {
            const row = { period };
            for (const cat of topCategories) {
                const match = trendData.find(d => d.period === period && d.category_id === cat.id);
                row[cat.name] = match ? Math.round(match.total * 100) / 100 : 0;
            }
            return row;
        });

        res.json({
            categories: topCategories.map(c => ({
                id: c.id,
                name: c.name,
                icon: c.icon
            })),
            data
        });
    } catch (error) {
        console.error('Error fetching category trend:', error);
        res.status(500).json({ error: 'Failed to fetch category trend' });
    }
});

// GET /api/reports/balance-history - Net worth history
// Sums ALL accounts (bank, cash, investments, retirement, credit cards, loans),
// anchored to the current total and back-solved through daily/monthly changes.
// ?granularity=month returns one point per month-end (default: per day).
router.get('/balance-history', (req, res) => {
    try {
        const granularity = req.query.granularity === 'month' ? 'month' : 'day';

        // Current net worth = sum of all settled transactions across all accounts
        const currentBalance = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM transactions
            WHERE status = 'settled'
        `).get().total;

        if (granularity === 'month') {
            const months = Math.min(Math.max(parseInt(req.query.months) || 12, 1), 60);
            const currentMonth = currentYearMonth();

            const monthlyChanges = Object.fromEntries(db.prepare(`
                SELECT strftime('%Y-%m', date) as m, SUM(amount) as change
                FROM transactions
                WHERE status = 'settled' AND date IS NOT NULL
                GROUP BY m
            `).all().map(r => [r.m, r.change]));

            // Don't report months before the data starts — a flat zero line
            // before the first transaction is noise, not history.
            const firstMonth = Object.keys(monthlyChanges).sort()[0] || currentMonth;

            // Walk backward from the current month
            const history = [];
            let running = currentBalance;
            let ym = currentMonth;
            for (let i = 0; i < months && ym >= firstMonth; i++) {
                history.push({ month: ym, balance: round2(running) });
                running -= monthlyChanges[ym] || 0;
                ym = shiftMonth(ym, -1);
            }
            return res.json(history.reverse());
        }

        const { start, end } = getDateRange(req);

        // Transactions after the end date are subtracted to find the balance at 'end'
        const futureTransactions = db.prepare(`
            SELECT
                COALESCE(SUM(amount), 0) as sum
            FROM transactions
            WHERE date > ? AND status = 'settled'
        `).get(end).sum;

        let runningBalance = currentBalance - futureTransactions;

        const periodTransactions = db.prepare(`
            SELECT date, SUM(amount) as daily_change
            FROM transactions
            WHERE date >= ? AND date <= ? AND status = 'settled'
            GROUP BY date
        `).all(start, end);

        const changeMap = Object.fromEntries(periodTransactions.map(t => [t.date, t.daily_change]));

        // Build daily history working backwards from the end of the range
        const history = [];
        for (const dateStr of eachDay(start, end).reverse()) {
            history.push({ date: dateStr, balance: round2(runningBalance) });
            runningBalance -= changeMap[dateStr] || 0;
        }

        res.json(history.reverse());
    } catch (error) {
        console.error('Error fetching balance history:', error);
        res.status(500).json({ error: 'Failed to fetch balance history' });
    }
});

// GET /api/reports/daily-spending - Spending per day in period
// ?budgetedOnly=true restricts to categories with a monthly budget, so the
// total is comparable to the budget pace line.
router.get('/daily-spending', (req, res) => {
    try {
        const { start, end } = getDateRange(req);
        const budgetedOnly = req.query.budgetedOnly === 'true';

        const dailyData = db.prepare(`
            SELECT
                t.date,
                COALESCE(SUM(ABS(t.amount)), 0) as spending
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.date >= ? AND t.date <= ?
            AND t.status = 'settled'
            AND t.amount < 0
            AND c.is_system = 0
            ${budgetedOnly ? 'AND c.monthly_amount > 0' : ''}
            GROUP BY t.date
            ORDER BY t.date
        `).all(start, end);

        // Fill in missing days with zero spending
        const spendingByDate = Object.fromEntries(dailyData.map(row => [row.date, row.spending]));
        const result = eachDay(start, end).map(dateStr => ({
            date: dateStr,
            spending: round2(spendingByDate[dateStr] || 0)
        }));

        res.json(result);
    } catch (error) {
        console.error('Error fetching daily spending:', error);
        res.status(500).json({ error: 'Failed to fetch daily spending' });
    }
});

// GET /api/reports/monthly-spending - Per-month spending, split budgeted vs
// unbudgeted. (Income lives in system categories in this ledger, so an
// income-vs-expenses view would always read zero income — this split is the
// meaningful monthly comparison instead.)
router.get('/monthly-spending', (req, res) => {
    try {
        const { start, end } = getDateRange(req);

        const rows = db.prepare(`
            SELECT
                strftime('%Y-%m', t.date) as month,
                COALESCE(SUM(CASE WHEN c.monthly_amount > 0 THEN ABS(t.amount) ELSE 0 END), 0) as budgeted,
                COALESCE(SUM(CASE WHEN c.monthly_amount > 0 THEN 0 ELSE ABS(t.amount) END), 0) as unbudgeted
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.date >= ? AND t.date <= ?
            AND t.status = 'settled'
            AND t.amount < 0
            AND c.is_system = 0
            GROUP BY month
            ORDER BY month
        `).all(start, end);

        res.json(rows.map(r => ({
            month: r.month,
            budgeted: round2(r.budgeted),
            unbudgeted: round2(r.unbudgeted)
        })));
    } catch (error) {
        console.error('Error fetching monthly spending:', error);
        res.status(500).json({ error: 'Failed to fetch monthly spending' });
    }
});

// GET /api/reports/forecast?month=YYYY-MM - Spending forecast + daily pulse
//
// Explainable, no-ML prediction from up to 6 closed months of history:
// - Fixed bills (Internet, HOA, ...) are detected by regularity: nonzero spend
//   in >=3 of the last 4 closed months, <=2 transactions/month, and coefficient
//   of variation <= 0.15. Projection = median of the last 3 nonzero months, and
//   the bill is flagged "due" when unpaid past its usual day of month + 5.
// - Variable categories blend a trimmed-mean baseline of closed months with the
//   current month's spending pace, weighted by how far into the month we are:
//   projected = w * pace + (1 - w) * baseline, w = dayOfMonth / daysInMonth.
//   Never projects below what has already been spent + pending.
// For a past (closed) month the endpoint returns actuals so the frontend can
// reuse the same payload as a "month in review".
router.get('/forecast', (req, res) => {
    try {
        const requested = req.query.month;
        const month = /^\d{4}-\d{2}$/.test(requested || '') ? requested : currentYearMonth();
        const thisMonth = currentYearMonth();
        const isCurrentMonth = month === thisMonth;
        const isPastMonth = month < thisMonth;
        const { start, end } = monthRange(month);
        const daysInMonth = Number(end.slice(8, 10));
        const dayOfMonth = isCurrentMonth
            ? Number(localToday().slice(8, 10))
            : (isPastMonth ? daysInMonth : 0);
        const daysRemaining = daysInMonth - dayOfMonth;

        const HISTORY_MONTHS = 6;
        const windowStart = `${shiftMonth(month, -HISTORY_MONTHS)}-01`;
        const closedMonths = Array.from({ length: HISTORY_MONTHS }, (_, i) =>
            shiftMonth(month, -(HISTORY_MONTHS - i)));

        // One pass over history: spend, txn count, and typical bill day per
        // category-month (expenses in user categories only)
        const historyRows = db.prepare(`
            SELECT
                t.category_id as cid,
                strftime('%Y-%m', t.date) as m,
                SUM(ABS(t.amount)) as spent,
                COUNT(*) as n,
                CAST(AVG(CAST(strftime('%d', t.date) AS INTEGER)) AS INTEGER) as avg_day
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.status = 'settled' AND t.amount < 0
            AND c.is_system = 0
            AND t.date >= ? AND t.date <= ?
            GROUP BY t.category_id, m
        `).all(windowStart, end);

        const byCategory = {};
        for (const row of historyRows) {
            (byCategory[row.cid] ??= {})[row.m] = row;
        }

        // Pending expenses count toward the target month
        const pendingByCategory = Object.fromEntries(db.prepare(`
            SELECT t.category_id as cid, SUM(ABS(t.amount)) as total
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.status = 'pending' AND t.amount < 0 AND c.is_system = 0
            GROUP BY t.category_id
        `).all().map(r => [r.cid, r.total]));

        const categories = db.prepare(`
            SELECT id, name, icon, monthly_amount
            FROM categories
            WHERE is_system = 0 AND is_hidden = 0
        `).all();

        const results = [];
        for (const cat of categories) {
            const months = byCategory[cat.id] || {};
            const spentSoFar = months[month]?.spent || 0;
            const pending = isCurrentMonth ? (pendingByCategory[cat.id] || 0) : 0;

            // Skip categories with no budget and no activity in the window
            const hasActivity = Object.keys(months).length > 0;
            if (!cat.monthly_amount && !hasActivity) continue;

            // Only count closed months since the category first appeared, so a
            // category created in March isn't averaged over a zero January.
            const firstMonth = Object.keys(months).sort()[0] || month;
            const usableMonths = closedMonths.filter(m => m >= firstMonth);
            const values = usableMonths.map(m => months[m]?.spent || 0);
            const nonzero = values.filter(v => v > 0);

            // Fixed-bill detection over the last 4 closed months
            const recent = usableMonths.slice(-4).map(m => months[m]);
            const recentNonzero = recent.filter(r => r && r.spent > 0);
            const maxTxns = Math.max(0, ...recentNonzero.map(r => r.n));
            const mean = nonzero.length ? nonzero.reduce((s, v) => s + v, 0) / nonzero.length : 0;
            const stdev = nonzero.length
                ? Math.sqrt(nonzero.reduce((s, v) => s + (v - mean) ** 2, 0) / nonzero.length)
                : 0;
            const cv = mean > 0 ? stdev / mean : Infinity;
            const isFixed = recentNonzero.length >= 3 && maxTxns <= 2 && cv <= 0.15;

            let projected;
            let status;
            if (isPastMonth) {
                projected = spentSoFar;
                status = cat.monthly_amount > 0 && spentSoFar > cat.monthly_amount ? 'over' : 'on_track';
            } else if (isFixed) {
                const lastNonzero = usableMonths
                    .filter(m => (months[m]?.spent || 0) > 0)
                    .slice(-3)
                    .map(m => months[m].spent);
                projected = median(lastNonzero);
                const billDay = median(recentNonzero.map(r => r.avg_day));
                status = spentSoFar === 0 && dayOfMonth > billDay + 5 ? 'due' : 'expected';
                projected = Math.max(projected, spentSoFar + pending);
            } else {
                const baseline = trimmedMean(values);
                const w = daysInMonth > 0 ? dayOfMonth / daysInMonth : 0;
                const pace = dayOfMonth > 0 ? (spentSoFar * daysInMonth) / dayOfMonth : 0;
                projected = w * pace + (1 - w) * baseline;
                projected = Math.max(projected, spentSoFar + pending);
                status = cat.monthly_amount > 0 && projected > cat.monthly_amount * 1.05
                    ? 'over' : 'on_track';
            }

            results.push({
                id: cat.id,
                name: cat.name,
                icon: cat.icon,
                monthlyAmount: cat.monthly_amount,
                spentSoFar: round2(spentSoFar),
                pending: round2(pending),
                projected: round2(projected),
                kind: isFixed ? 'fixed' : 'variable',
                status,
                history: [...usableMonths, month].map(m => ({
                    month: m,
                    total: round2(months[m]?.spent || 0)
                }))
            });
        }

        results.sort((a, b) => b.projected - a.projected);

        // Pulse totals cover BUDGETED categories only — unbudgeted flows like
        // investments or one-off insurance would swamp the daily numbers.
        // They are reported separately under `unbudgeted`.
        const budgeted = results.filter(r => r.monthlyAmount > 0);
        const unbudgeted = results.filter(r => !r.monthlyAmount);
        const budgetTotal = budgeted.reduce((s, r) => s + r.monthlyAmount, 0);
        const spentSoFar = budgeted.reduce((s, r) => s + r.spentSoFar, 0);
        const pendingTotal = budgeted.reduce((s, r) => s + r.pending, 0);
        const forecastTotal = budgeted.reduce((s, r) => s + r.projected, 0);

        res.json({
            month,
            isCurrentMonth,
            dayOfMonth,
            daysInMonth,
            daysRemaining,
            budgetTotal: round2(budgetTotal),
            spentSoFar: round2(spentSoFar),
            pendingTotal: round2(pendingTotal),
            budgetToDate: isCurrentMonth ? round2(budgetTotal * (dayOfMonth / daysInMonth)) : null,
            paceProjection: isCurrentMonth && dayOfMonth > 0
                ? round2((spentSoFar * daysInMonth) / dayOfMonth) : null,
            forecastTotal: round2(forecastTotal),
            safeToSpendPerDay: isCurrentMonth && daysRemaining > 0
                ? round2(Math.max(0, (budgetTotal - spentSoFar - pendingTotal) / daysRemaining))
                : null,
            unbudgeted: {
                spentSoFar: round2(unbudgeted.reduce((s, r) => s + r.spentSoFar, 0)),
                projected: round2(unbudgeted.reduce((s, r) => s + r.projected, 0))
            },
            categories: results
        });
    } catch (error) {
        console.error('Error building forecast:', error);
        res.status(500).json({ error: 'Failed to build forecast' });
    }
});

// GET /api/reports/top-expenses - Largest single expenses in period
router.get('/top-expenses', (req, res) => {
    try {
        const { start, end } = getDateRange(req);
        const limit = parseInt(req.query.limit) || 10;

        const expenses = db.prepare(`
            SELECT 
                t.id,
                t.date,
                t.memo as description,
                t.amount,
                c.name as category,
                c.icon
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.date >= ? AND t.date <= ?
            AND t.status = 'settled'
            AND t.amount < 0
            AND c.is_system = 0
            ORDER BY ABS(t.amount) DESC
            LIMIT ?
        `).all(start, end, limit);

        res.json(expenses.map(e => ({
            ...e,
            amount: Math.abs(e.amount) // Return positive value for display
        })));
    } catch (error) {
        console.error('Error fetching top expenses:', error);
        res.status(500).json({ error: 'Failed to fetch top expenses' });
    }
});

export default router;
