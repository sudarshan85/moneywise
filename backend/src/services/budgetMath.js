/**
 * The two headline calculations: the Dashboard payload and Ready to Assign.
 *
 * Pure functions of a database connection, with no import-time side effects,
 * so they can be shared by the Express routes (which pass the app's connection)
 * and the local MCP connector in mcp/ (which opens and reopens its own).
 * Keeping one copy means the connector always reports the numbers the UI shows.
 */

import { currentYearMonth, monthRange } from '../utils/dates.js';

// Helper: turn [{cid, total}, ...] into {cid: total}
function totalsByCategory(rows) {
    const map = {};
    for (const row of rows) {
        map[row.cid] = row.total;
    }
    return map;
}

// Build the main dashboard payload.
// Read-only: everything (including carried-forward) is derived live from source
// data with a fixed number of GROUP BY aggregates, regardless of category count.
// `db` is a better-sqlite3 connection.
export function buildDashboardData(db) {
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

    return {
        currentMonth,
        monthlyIncome,
        monthlySpent: Math.round(totalSpent * 100) / 100,
        pendingCount,
        categories: categoryData,
        assets,
        liabilities,
        lastReconciled
    };
}

// Build "Ready to Assign" (money not yet allocated).
// `db` is a better-sqlite3 connection.
// Formula: on-budget account balances - Sum of all category (envelope) balances
// Category balance = Transfers IN - Spending
//
// "On-budget" = accounts flagged in_moneypot = 1: bank and cash, plus credit cards
// used as a spending vehicle. Including the card's (negative) balance makes a card
// swipe reduce the pool exactly like a debit purchase (the envelope drop and the
// balance drop cancel), and paying the card bill becomes a wash — so envelope
// spending on credit never inflates Ready to Assign. Investment/retirement/loan
// accounts are off-budget: money moved there was recorded as leaving the pool.
export function buildReadyToAssign(db) {
    // On-budget balances, with the credit-card share broken out for display
    const bankResult = db.prepare(`
        SELECT COALESCE(SUM(t.amount), 0) as total_balance,
               COALESCE(SUM(CASE WHEN a.type = 'credit_card' THEN t.amount ELSE 0 END), 0) as credit_card_balance
        FROM accounts a
        LEFT JOIN transactions t ON t.account_id = a.id AND t.status = 'settled'
        WHERE a.in_moneypot = 1 AND a.is_hidden = 0
    `).get();

    // Get "Available to Budget" system category ID
    const atbCategory = db.prepare(`
        SELECT id FROM categories WHERE name = 'Available to Budget' AND is_system = 1
    `).get();

    // Calculate total category balances for user categories
    // Category Balance = Transfers IN from ATB - Spending
    let totalCategoryBalance = 0;

    if (atbCategory) {
        // Get sum of transfers FROM "Available to Budget" to user categories
        const transfersFromATB = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM category_transfers
            WHERE from_category_id = ?
        `).get(atbCategory.id);

        // Get sum of transfers TO "Available to Budget" (money returned)
        const transfersToATB = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM category_transfers
            WHERE to_category_id = ?
        `).get(atbCategory.id);

        // Get sum of spending in user categories
        // (negative amounts = outflow/spending)
        const spendingResult = db.prepare(`
            SELECT COALESCE(SUM(t.amount), 0) as total
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE c.is_system = 0 AND t.status = 'settled'
        `).get();

        // Category Balance = Transfers In - Transfers Out + Spending (spending is negative)
        totalCategoryBalance = transfersFromATB.total - transfersToATB.total + spendingResult.total;
    }

    // Ready to Assign = on-budget balances - envelope balances
    const readyToAssign = bankResult.total_balance - totalCategoryBalance;

    return {
        balance: readyToAssign,
        // Breakdown so the UI can show the math: liquid - cardOwed - allocated
        liquid: bankResult.total_balance - bankResult.credit_card_balance,
        creditCardOwed: -bankResult.credit_card_balance,
        allocated: totalCategoryBalance,
        // Legacy field names still read by existing frontend code paths
        bankBalance: bankResult.total_balance,
        categoryBalance: totalCategoryBalance
    };
}
