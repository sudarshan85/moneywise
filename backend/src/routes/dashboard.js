import express from 'express';
import db from '../db/database.js';
import { currentYearMonth, monthRange } from '../utils/dates.js';
import { computeCarriedForward } from '../utils/envelope.js';
import { buildDashboardData } from '../services/budgetMath.js';

const router = express.Router();

// Helper: Get previous month in YYYY-MM format
function getPreviousMonth(yearMonth) {
    const [year, month] = yearMonth.split('-').map(Number);
    if (month === 1) {
        return `${year - 1}-12`;
    }
    return `${year}-${String(month - 1).padStart(2, '0')}`;
}

// GET /api/dashboard - Main dashboard data (math lives in services/budgetMath.js)
router.get('/', (req, res) => {
    try {
        res.json(buildDashboardData(db));
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
