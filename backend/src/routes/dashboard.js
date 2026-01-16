import express from 'express';
import db from '../db/database.js';

const router = express.Router();

// Helper: Get current month in YYYY-MM format
function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Helper: Get previous month in YYYY-MM format
function getPreviousMonth(yearMonth) {
    const [year, month] = yearMonth.split('-').map(Number);
    if (month === 1) {
        return `${year - 1}-12`;
    }
    return `${year}-${String(month - 1).padStart(2, '0')}`;
}

// Helper: Ensure carried forward is calculated for a given month
function ensureCarriedForward(yearMonth) {
    const prevMonth = getPreviousMonth(yearMonth);

    // Get all user categories
    const categories = db.prepare(`
        SELECT id FROM categories WHERE is_system = 0 AND is_hidden = 0
    `).all();

    // For each category, check if carried forward exists for this month
    const checkStmt = db.prepare(`
        SELECT id FROM category_monthly_balances 
        WHERE category_id = ? AND year_month = ?
    `);

    const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO category_monthly_balances (category_id, year_month, carried_forward)
        VALUES (?, ?, ?)
    `);

    for (const cat of categories) {
        const exists = checkStmt.get(cat.id, yearMonth);
        if (!exists) {
            // Calculate previous month's ending balance
            const prevBalance = calculateCategoryBalance(cat.id, prevMonth);
            insertStmt.run(cat.id, yearMonth, prevBalance);
        }
    }
}

// Helper: Calculate category balance for a specific month
function calculateCategoryBalance(categoryId, yearMonth) {
    const startDate = `${yearMonth}-01`;
    const [year, month] = yearMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    // Get carried forward from previous month (if exists)
    const prevMonth = getPreviousMonth(yearMonth);
    const carriedForward = db.prepare(`
        SELECT carried_forward FROM category_monthly_balances
        WHERE category_id = ? AND year_month = ?
    `).get(categoryId, yearMonth);

    // Get transfers INTO this category this month
    const transfersIn = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM category_transfers
        WHERE to_category_id = ? AND date >= ? AND date <= ?
    `).get(categoryId, startDate, endDate);

    // Get transfers OUT of this category this month
    const transfersOut = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM category_transfers
        WHERE from_category_id = ? AND date >= ? AND date <= ?
    `).get(categoryId, startDate, endDate);

    // Get spending (negative transactions) this month
    const spending = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM transactions
        WHERE category_id = ? AND date >= ? AND date <= ? AND status = 'settled'
    `).get(categoryId, startDate, endDate);

    // Balance = carried forward + transfers in - transfers out + spending (spending is negative)
    const cf = carriedForward?.carried_forward || 0;
    return cf + transfersIn.total - transfersOut.total + spending.total;
}

// GET /api/dashboard - Main dashboard data
router.get('/', (req, res) => {
    try {
        const currentMonth = getCurrentMonth();
        const startDate = `${currentMonth}-01`;
        const [year, month] = currentMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${currentMonth}-${String(lastDay).padStart(2, '0')}`;

        // Ensure carried forward data exists for current month
        ensureCarriedForward(currentMonth);

        // 1. Get monthly income from settings
        const incomeSetting = db.prepare(`
            SELECT value FROM app_settings WHERE key = 'monthly_income'
        `).get();
        const monthlyIncome = parseFloat(incomeSetting?.value) || 0;

        // 2. Get all user categories with transaction count for ordering
        // Order: budgeted categories first (by transaction count desc), then non-budgeted
        const categories = db.prepare(`
            SELECT c.id, c.name, c.icon, c.monthly_amount,
                   COALESCE(cmb.carried_forward, 0) as carried_forward,
                   (SELECT COUNT(*) FROM transactions t 
                    WHERE t.category_id = c.id 
                    AND t.date >= ? AND t.date <= ?) as tx_count
            FROM categories c
            LEFT JOIN category_monthly_balances cmb 
                ON c.id = cmb.category_id AND cmb.year_month = ?
            WHERE c.is_system = 0 AND c.is_hidden = 0
            ORDER BY 
                CASE WHEN c.monthly_amount > 0 THEN 0 ELSE 1 END,
                tx_count DESC,
                c.name
        `).all(startDate, endDate, currentMonth);

        // Calculate activity and available for each category
        const categoryData = categories.map(cat => {
            // Get transfers INTO this category this month (budgeted)
            const transfersIn = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM category_transfers
                WHERE to_category_id = ? AND date >= ? AND date <= ?
            `).get(cat.id, startDate, endDate);

            // Get transfers OUT of this category this month
            const transfersOut = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM category_transfers
                WHERE from_category_id = ? AND date >= ? AND date <= ?
            `).get(cat.id, startDate, endDate);

            // Get settled spending this month (activity - negative means spending)
            const settledSpending = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM transactions
                WHERE category_id = ? AND date >= ? AND date <= ? AND status = 'settled'
            `).get(cat.id, startDate, endDate);

            // Get pending spending (all pending transactions regardless of date)
            const pendingSpending = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM transactions
                WHERE category_id = ? AND status = 'pending'
            `).get(cat.id);

            // Activity = settled spending + pending spending
            const activity = settledSpending.total + pendingSpending.total;

            // Available = carried forward + budgeted (transfers in) - transfers out + activity
            const budgeted = transfersIn.total;
            const available = cat.carried_forward + budgeted - transfersOut.total + activity;

            return {
                id: cat.id,
                name: cat.name,
                icon: cat.icon,
                available: Math.round(available * 100) / 100,
                activity: Math.round(activity * 100) / 100,
                pendingActivity: Math.round(pendingSpending.total * 100) / 100,
                monthlyAmount: cat.monthly_amount,
                carriedForward: Math.round(cat.carried_forward * 100) / 100,
                isOverBudget: available < 0
            };
        });

        // 3. Calculate total spent this month (sum of negative activity)
        const totalSpent = Math.abs(categoryData.reduce((sum, cat) => {
            return sum + (cat.activity < 0 ? cat.activity : 0);
        }, 0));

        // 4. Get all accounts with balances
        const accounts = db.prepare(`
            SELECT a.id, a.name, a.icon, a.type,
                   COALESCE(SUM(t.amount), 0) as balance
            FROM accounts a
            LEFT JOIN transactions t ON t.account_id = a.id AND t.status = 'settled'
            WHERE a.is_hidden = 0
            GROUP BY a.id
            ORDER BY 
                CASE a.type 
                    WHEN 'bank' THEN 1
                    WHEN 'cash' THEN 2
                    WHEN 'investment' THEN 3
                    WHEN 'retirement' THEN 4
                    WHEN 'credit_card' THEN 5
                    WHEN 'loan' THEN 6
                END,
                a.name
        `).all();

        // Split accounts into assets and liabilities
        const assets = accounts
            .filter(a => ['bank', 'cash', 'investment', 'retirement'].includes(a.type))
            .map(a => ({ ...a, balance: Math.round(a.balance * 100) / 100 }));

        const liabilities = accounts
            .filter(a => ['credit_card', 'loan'].includes(a.type))
            .map(a => ({ ...a, balance: Math.round(a.balance * 100) / 100 }));

        // 5. Get last reconciliation date (most recent reconciliation point)
        const lastReconciledRow = db.prepare(`
            SELECT MAX(date) as last_date
            FROM transactions
            WHERE is_reconciliation_point = 1
        `).get();
        const lastReconciled = lastReconciledRow?.last_date || null;

        // 6. Get total pending transaction count
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
        const currentMonth = getCurrentMonth();
        const prevMonth = getPreviousMonth(currentMonth);
        const startDate = `${currentMonth}-01`;
        const [year, month] = currentMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${currentMonth}-${String(lastDay).padStart(2, '0')}`;

        // Previous month dates
        const [prevYear, prevMonthNum] = prevMonth.split('-').map(Number);
        const prevLastDay = new Date(prevYear, prevMonthNum, 0).getDate();
        const prevStartDate = `${prevMonth}-01`;
        const prevEndDate = `${prevMonth}-${String(prevLastDay).padStart(2, '0')}`;

        // Get category info
        const category = db.prepare(`
            SELECT c.id, c.name, c.icon, c.monthly_amount,
                   COALESCE(cmb.carried_forward, 0) as carried_forward
            FROM categories c
            LEFT JOIN category_monthly_balances cmb 
                ON c.id = cmb.category_id AND cmb.year_month = ?
            WHERE c.id = ?
        `).get(currentMonth, categoryId);

        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

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

        // Get last reconciliation date for any account (placeholder - we'll update when reconciliation is implemented)
        const lastReconciled = null; // TODO: Implement when reconciliation is added

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
            lastReconciled
        });
    } catch (error) {
        console.error('Error fetching category details:', error);
        res.status(500).json({ error: 'Failed to fetch category details' });
    }
});

export default router;

