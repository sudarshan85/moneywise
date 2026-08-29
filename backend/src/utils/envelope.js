import db from '../db/database.js';

// Compute a category's TRUE carried-forward balance for a given month.
// This is the running envelope balance at the end of the PREVIOUS month, i.e. the
// sum of every transfer in/out and every settled transaction dated strictly before
// this month starts. It is always derived from source data (never a frozen
// snapshot), so it self-corrects when past transactions are added or edited.
//
// Pending transactions are intentionally excluded here: the dashboard always treats
// pending as current-month "activity" (no date filter), so counting them in carried
// forward too would double-count them.
export function computeCarriedForward(categoryId, yearMonth) {
    const startDate = `${yearMonth}-01`;

    const transfersIn = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM category_transfers
        WHERE to_category_id = ? AND date < ?
    `).get(categoryId, startDate).total;

    const transfersOut = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM category_transfers
        WHERE from_category_id = ? AND date < ?
    `).get(categoryId, startDate).total;

    const settledSpending = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM transactions
        WHERE category_id = ? AND status = 'settled' AND date < ?
    `).get(categoryId, startDate).total;

    // Spending is stored negative, so a deficit rolls forward as a negative balance.
    return transfersIn - transfersOut + settledSpending;
}
