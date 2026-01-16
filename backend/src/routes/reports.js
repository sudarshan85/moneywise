import express from 'express';
import db from '../db/database.js';

const router = express.Router();

// Helper: Parse date range from query params
function getDateRange(req) {
    const { start, end } = req.query;
    if (!start || !end) {
        // Default to current month
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const lastDay = new Date(year, month, 0).getDate();
        return {
            start: `${year}-${String(month).padStart(2, '0')}-01`,
            end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        };
    }
    return { start, end };
}

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

// GET /api/reports/balance-history - Daily net worth history
router.get('/balance-history', (req, res) => {
    try {
        const { start, end } = getDateRange(req);

        // 1. Get current total balance (Assets - Liabilities)
        // 1. Get current total balance (Sum of all settled transactions)
        // Note: accounts table doesn't have a balance column; it's calculated from transactions
        const currentBalance = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM transactions
            WHERE status = 'settled'
        `).get().total;

        // 2. Get all transactions AFTER the end date (future relative to report)
        // These need to be subtracted from current balance to find balance at 'end'
        const futureTransactions = db.prepare(`
            SELECT 
                COALESCE(SUM(amount), 0) as sum
            FROM transactions
            WHERE date > ? AND status = 'settled'
        `).get(end).sum;

        // Balance at end of the requested period
        let runningBalance = currentBalance - futureTransactions;

        // 3. Get all transactions WITHIN the period, ordered by date DESC
        const periodTransactions = db.prepare(`
            SELECT date, SUM(amount) as daily_change
            FROM transactions
            WHERE date >= ? AND date <= ? AND status = 'settled'
            GROUP BY date
            ORDER BY date DESC
        `).all(start, end);

        // Map daily changes
        const changeMap = Object.fromEntries(periodTransactions.map(t => [t.date, t.daily_change]));

        // 4. Build daily history working backwards
        const history = [];
        const endDateObj = new Date(end);
        const startDateObj = new Date(start);

        // Loop backwards from end date to start date
        for (let d = endDateObj; d >= startDateObj; d.setDate(d.getDate() - 1)) {
            const dateStr = d.toISOString().split('T')[0];

            // Record balance for this day (at end of day)
            history.push({ date: dateStr, balance: Math.round(runningBalance * 100) / 100 });

            // Update running balance for PREVIOUS day (subtract today's change)
            // If today we had +100 change, yesterday was Balance - 100.
            const change = changeMap[dateStr] || 0;
            runningBalance -= change;
        }

        // Reverse to return chronological order (oldest -> newest)
        res.json(history.reverse());
    } catch (error) {
        console.error('Error fetching balance history:', error);
        res.status(500).json({ error: 'Failed to fetch balance history' });
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
