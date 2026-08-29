import express from 'express';
import db from '../db/database.js';
import { currentYearMonth, monthRange } from '../utils/dates.js';
import { computeCarriedForward } from '../utils/envelope.js';

const router = express.Router();

// Helper: Get previous month in YYYY-MM format
function getPreviousMonth(yearMonth) {
    const [year, month] = yearMonth.split('-').map(Number);
    if (month === 1) {
        return `${year - 1}-12`;
    }
    return `${year}-${String(month - 1).padStart(2, '0')}`;
}

// Helper: turn [{cid, total}, ...] into {cid: total}
function totalsByCategory(rows) {
    const map = {};
    for (const row of rows) {
        map[row.cid] = row.total;
    }
    return map;
}

// GET /api/dashboard - Main dashboard data
// Read-only: everything (including carried-forward) is derived live from source
// data with a fixed number of GROUP BY aggregates, regardless of category count.
router.get('/', (req, res) => {
    try {
        const currentMonth = currentYearMonth();
        const { start: startDate, end: endDate } = monthRange(currentMonth);

        // 1. Get monthly income from settings
        const incomeSetting = db.prepare(`
            SELECT value FROM app_settings WHERE key = 'monthly_income'
        `).get();
        const monthlyIncome = parseFloat(incomeSetting?.value) || 0;

        // 2. Per-category aggregates for the current month
        const transfersIn = totalsByCategory(db.prepare(`
            SELECT to_category_id as cid, COALESCE(SUM(amount), 0) as total
            FROM category_transfers
            WHERE to_category_id IS NOT NULL AND date >= ? AND date <= ?
            GROUP BY to_category_id
        `).all(startDate, endDate));

        const transfersOut = totalsByCategory(db.prepare(`
            SELECT from_category_id as cid, COALESCE(SUM(amount), 0) as total
            FROM category_transfers
            WHERE from_category_id IS NOT NULL AND date >= ? AND date <= ?
            GROUP BY from_category_id
        `).all(startDate, endDate));

        const settledActivity = totalsByCategory(db.prepare(`
            SELECT category_id as cid, COALESCE(SUM(amount), 0) as total
            FROM transactions
            WHERE category_id IS NOT NULL AND status = 'settled' AND date >= ? AND date <= ?
            GROUP BY category_id
        `).all(startDate, endDate));

        // Pending is counted regardless of date (pending rows usually have none)
        const pendingActivity = totalsByCategory(db.prepare(`
            SELECT category_id as cid, COALESCE(SUM(amount), 0) as total
            FROM transactions
            WHERE category_id IS NOT NULL AND status = 'pending'
            GROUP BY category_id
        `).all());

        // Month tx count + spent per category, used only for display ordering
        const monthStats = {};
        for (const row of db.prepare(`
            SELECT category_id as cid, COUNT(*) as cnt,
                   COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as spent
            FROM transactions
            WHERE category_id IS NOT NULL AND date >= ? AND date <= ?
            GROUP BY category_id
        `).all(startDate, endDate)) {
            monthStats[row.cid] = row;
        }

        // Carried-forward inputs: everything dated strictly before this month.
        // (date < startDate is NULL-safe: dateless pending rows never match.)
        const cfTransfersIn = totalsByCategory(db.prepare(`
            SELECT to_category_id as cid, COALESCE(SUM(amount), 0) as total
            FROM category_transfers
            WHERE to_category_id IS NOT NULL AND date < ?
            GROUP BY to_category_id
        `).all(startDate));

        const cfTransfersOut = totalsByCategory(db.prepare(`
            SELECT from_category_id as cid, COALESCE(SUM(amount), 0) as total
            FROM category_transfers
            WHERE from_category_id IS NOT NULL AND date < ?
            GROUP BY from_category_id
        `).all(startDate));

        const cfSpending = totalsByCategory(db.prepare(`
            SELECT category_id as cid, COALESCE(SUM(amount), 0) as total
            FROM transactions
            WHERE category_id IS NOT NULL AND status = 'settled' AND date < ?
            GROUP BY category_id
        `).all(startDate));

        // 3. Assemble category cards
        const categories = db.prepare(`
            SELECT id, name, icon, monthly_amount
            FROM categories
            WHERE is_system = 0 AND is_hidden = 0
        `).all();

        const categoryData = categories.map(cat => {
            const carriedForward = (cfTransfersIn[cat.id] || 0)
                - (cfTransfersOut[cat.id] || 0)
                + (cfSpending[cat.id] || 0);
            const budgeted = transfersIn[cat.id] || 0;
            const outgoing = transfersOut[cat.id] || 0;
            const pending = pendingActivity[cat.id] || 0;
            const activity = (settledActivity[cat.id] || 0) + pending;

            // Available = carried forward + budgeted (transfers in) - transfers out + activity
            const available = carriedForward + budgeted - outgoing + activity;

            return {
                id: cat.id,
                name: cat.name,
                icon: cat.icon,
                available: Math.round(available * 100) / 100,
                activity: Math.round(activity * 100) / 100,
                pendingActivity: Math.round(pending * 100) / 100,
                monthlyAmount: cat.monthly_amount,
                carriedForward: Math.round(carriedForward * 100) / 100,
                isOverBudget: available < 0
            };
        });

        // Order: budgeted categories first, then tiered by this month's tx count
        // (>=3, 1-2, 0), then by spent amount desc, then by name
        const tierOf = (id) => {
            const cnt = monthStats[id]?.cnt || 0;
            return cnt >= 3 ? 0 : cnt >= 1 ? 1 : 2;
        };
        categoryData.sort((a, b) =>
            (a.monthlyAmount > 0 ? 0 : 1) - (b.monthlyAmount > 0 ? 0 : 1)
            || tierOf(a.id) - tierOf(b.id)
            || (monthStats[b.id]?.spent || 0) - (monthStats[a.id]?.spent || 0)
            || a.name.localeCompare(b.name)
        );

        // 4. Calculate total spent this month (sum of negative activity)
        const totalSpent = Math.abs(categoryData.reduce((sum, cat) => {
            return sum + (cat.activity < 0 ? cat.activity : 0);
        }, 0));

        // 5. Get all accounts with settled and pending balances.
        // sort_order is user-managed in Configuration and respected here.
        const accounts = db.prepare(`
            SELECT a.id, a.name, a.icon, a.type, a.in_moneypot,
                   COALESCE(SUM(CASE WHEN t.status = 'settled' THEN t.amount ELSE 0 END), 0) as balance,
                   COALESCE(SUM(CASE WHEN t.status = 'pending' THEN t.amount ELSE 0 END), 0) as pending_balance
            FROM accounts a
            LEFT JOIN transactions t ON t.account_id = a.id
            WHERE a.is_hidden = 0
            GROUP BY a.id
            ORDER BY a.sort_order, a.name
        `).all();

        const shapeAccount = (a) => ({
            ...a,
            balance: Math.round(a.balance * 100) / 100,
            pendingBalance: Math.round(a.pending_balance * 100) / 100
        });

        const assets = accounts
            .filter(a => ['bank', 'cash', 'investment', 'retirement'].includes(a.type))
            .map(shapeAccount);

        const liabilities = accounts
            .filter(a => ['credit_card', 'loan'].includes(a.type))
            .map(shapeAccount);

        // 6. Get last reconciliation date (most recent reconciliation point)
        const lastReconciledRow = db.prepare(`
            SELECT MAX(date) as last_date
            FROM transactions
            WHERE is_reconciliation_point = 1
        `).get();
        const lastReconciled = lastReconciledRow?.last_date || null;

        // 7. Get total pending transaction count
        const pendingCountRow = db.prepare(`
            SELECT COUNT(*) as count
            FROM transactions
            WHERE status = 'pending'
        `).get();
        const pendingCount = pendingCountRow?.count || 0;

        res.json({
            currentMonth,
            monthlyIncome,
            monthlySpent: Math.round(totalSpent * 100) / 100,
            pendingCount,
            categories: categoryData,
            assets,
            liabilities,
            lastReconciled
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});


// GET /api/dashboard/category/:id - Get details for a specific category
router.get('/category/:id', (req, res) => {
    try {
        const categoryId = req.params.id;
        const currentMonth = currentYearMonth();
        const prevMonth = getPreviousMonth(currentMonth);
        const { start: startDate, end: endDate } = monthRange(currentMonth);
        const { start: prevStartDate, end: prevEndDate } = monthRange(prevMonth);

        // Get category info
        const category = db.prepare(`
            SELECT c.id, c.name, c.icon, c.monthly_amount
            FROM categories c
            WHERE c.id = ?
        `).get(categoryId);

        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        category.carried_forward = computeCarriedForward(categoryId, currentMonth);

        // Get actual spending this month (settled only)
        const settledSpending = db.prepare(`
            SELECT COALESCE(SUM(ABS(amount)), 0) as total
            FROM transactions
            WHERE category_id = ? AND date >= ? AND date <= ?
            AND status = 'settled' AND amount < 0
        `).get(categoryId, startDate, endDate);

        // Get pending spending (all pending, no date filter)
        const pendingSpending = db.prepare(`
            SELECT COALESCE(SUM(ABS(amount)), 0) as total
            FROM transactions
            WHERE category_id = ? AND status = 'pending' AND amount < 0
        `).get(categoryId);

        // Total spending includes pending
        const actualSpendingTotal = settledSpending.total + pendingSpending.total;

        // Get transfers in this month (budgeted)
        const budgeted = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM category_transfers
            WHERE to_category_id = ? AND date >= ? AND date <= ?
        `).get(categoryId, startDate, endDate);

        // Get transfers out this month
        const transfersOut = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM category_transfers
            WHERE from_category_id = ? AND date >= ? AND date <= ?
        `).get(categoryId, startDate, endDate);

        // Calculate available and percentage remaining (including pending)
        // Net budget = carried forward + transfers in - transfers out
        const netBudget = category.carried_forward + budgeted.total - transfersOut.total;
        const available = netBudget - actualSpendingTotal;

        const percentRemaining = netBudget > 0
            ? Math.round((available / netBudget) * 1000) / 10
            : (available >= 0 ? 100 : 0);

        // Get spent last month
        const spentLastMonth = db.prepare(`
            SELECT COALESCE(SUM(ABS(amount)), 0) as total
            FROM transactions
            WHERE category_id = ? AND date >= ? AND date <= ?
            AND status = 'settled' AND amount < 0
        `).get(categoryId, prevStartDate, prevEndDate);

        // Get transaction count and average this month
        const txStats = db.prepare(`
            SELECT COUNT(*) as count, COALESCE(AVG(ABS(amount)), 0) as avg
            FROM transactions
            WHERE category_id = ? AND date >= ? AND date <= ?
            AND status = 'settled' AND amount < 0
        `).get(categoryId, startDate, endDate);

        // Most recent reconciliation point (account-level feature; shown as context)
        const lastReconciledRow = db.prepare(`
            SELECT MAX(date) as last_date
            FROM transactions
            WHERE is_reconciliation_point = 1
        `).get();
        const lastReconciled = lastReconciledRow?.last_date || null;

        // Get recent transactions for this category (for expanded card view)
        const recentTransactions = db.prepare(`
            SELECT id, date, amount, memo, status, account_id
            FROM transactions
            WHERE category_id = ?
            ORDER BY
                CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
                date DESC,
                created_at DESC
            LIMIT 5
        `).all(categoryId);

        res.json({
            id: category.id,
            name: category.name,
            icon: category.icon,
            monthlyAmount: category.monthly_amount,
            actualSpending: Math.round(actualSpendingTotal * 100) / 100,
            percentRemaining,
            carriedForward: Math.round(category.carried_forward * 100) / 100,
            spentLastMonth: Math.round(spentLastMonth.total * 100) / 100,
            transactionCount: txStats.count,
            avgPerTransaction: Math.round(txStats.avg * 100) / 100,
            lastReconciled,
            recentTransactions
        });
    } catch (error) {
        console.error('Error fetching category details:', error);
        res.status(500).json({ error: 'Failed to fetch category details' });
    }
});

export default router;
