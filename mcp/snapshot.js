/**
 * Everything Claude needs for a detailed picture of Sudarshan's finances, in
 * one tool result.
 *
 * The whole database is small (~800 transactions), so there is no sampling or
 * summarising: Claude gets every row and does its own analysis. The two
 * derived blocks come from backend/src/services/budgetMath.js — the same code
 * the app runs — so Claude's numbers match what the Dashboard shows.
 *
 * Row-heavy tables are arrays-of-arrays with a separate column list, which is
 * roughly half the size of repeating the keys on every row.
 */

import { buildDashboardData, buildReadyToAssign } from '../backend/src/services/budgetMath.js';
import { localToday, currentYearMonth } from '../backend/src/utils/dates.js';

// The traps that produce confidently wrong numbers. The full explanation is in
// docs/moneywise.md (uploaded to the Claude project); these repeat the
// essentials so they travel with the data into any chat.
export const CRITICAL_RULES = [
    'Income is NOT categorized. Never sum positive transactions and call it income — they mix paychecks, starting balances, investment revaluations, card/loan balance adjustments and refunds. Use declaredMonthlyIncome; actual paychecks have memo Income or Salary into 360 Checking.',
    "'Balance Change' and 'Account Transfer' are system categories, not spending. Account transfers (card, mortgage and loan payments, moves to Robinhood) appear as two rows, one per account; exclude them from spending totals.",
    "What was budgeted in a month = that month's category_transfers with memo 'Auto Funded' (a top-up to each envelope's target), never categories.monthly_amount, which is only today's target. Jan and Jun 2026 were funded manually.",
    'On-budget accounts are in_moneypot = 1 (the CO Venture credit card is on-budget). Negative Ready to Assign means envelopes are over-allocated, not overspent.',
    'Pending transactions have date = null and count as current-month activity.',
    "Spending in the 'Invest' envelope is money moved to investments (savings), not consumption — report it separately. Refunds usually land in Balance Change, so envelope spending is gross of refunds.",
    'Always say "Ready to Assign", never "Available to Budget".'
];

export const TRANSACTION_COLUMNS = ['id', 'date', 'amount', 'account_id', 'category_id', 'memo', 'status'];
export const TRANSFER_COLUMNS = ['id', 'date', 'from_category_id', 'to_category_id', 'amount', 'memo'];

export function buildSnapshot(db, freshness) {
    const income = db.prepare(`SELECT value FROM app_settings WHERE key = 'monthly_income'`).get();

    const categories = db.prepare(`
        SELECT id, name, monthly_amount, is_system, is_hidden
        FROM categories
        ORDER BY id
    `).all();

    // Includes hidden accounts, which the dashboard block leaves out.
    const accounts = db.prepare(`
        SELECT a.id, a.name, a.type, a.in_moneypot, a.is_hidden,
               ROUND(COALESCE(SUM(CASE WHEN t.status = 'settled' THEN t.amount END), 0), 2) AS settled_balance,
               ROUND(COALESCE(SUM(CASE WHEN t.status = 'pending' THEN t.amount END), 0), 2) AS pending_amount
        FROM accounts a
        LEFT JOIN transactions t ON t.account_id = a.id
        GROUP BY a.id
        ORDER BY a.sort_order, a.name
    `).all();

    // Settled rows by date; pending rows (no date) last.
    const transactions = db.prepare(`
        SELECT id, date, amount, account_id, category_id, memo, status
        FROM transactions
        ORDER BY date IS NULL, date, id
    `).all().map(t => [t.id, t.date, t.amount, t.account_id, t.category_id, t.memo, t.status]);

    const categoryTransfers = db.prepare(`
        SELECT id, date, from_category_id, to_category_id, amount, memo
        FROM category_transfers
        ORDER BY date, id
    `).all().map(t => [t.id, t.date, t.from_category_id, t.to_category_id, t.amount, t.memo]);

    return {
        about: 'MoneyWise: Sudarshan\'s personal envelope-budgeting app. Full explanation in moneywise.md (project knowledge), if available.',
        dataFreshness: freshness,
        today: localToday(),
        currentMonth: currentYearMonth(),
        currency: 'USD',
        declaredMonthlyIncome: parseFloat(income?.value) || 0,
        criticalRules: CRITICAL_RULES,

        categories,
        accounts,

        readyToAssign: buildReadyToAssign(db),
        dashboardNow: buildDashboardData(db),

        transactionColumns: TRANSACTION_COLUMNS,
        transactions,
        transferColumns: TRANSFER_COLUMNS,
        categoryTransfers
    };
}
