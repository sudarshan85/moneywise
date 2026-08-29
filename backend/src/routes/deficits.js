import express from 'express';
import db from '../db/database.js';
import { currentYearMonth, monthRange, shiftMonth, localToday } from '../utils/dates.js';

const router = express.Router();

// Deficit analysis: reconstructs, for any month, which envelopes went negative,
// what caused it, and which category transfers fixed it. Everything is derived
// live from source data (same philosophy as the dashboard / docs/BUDGETING_MODEL.md).
//
// Conventions shared with the rest of the app:
// - "Budgeted" = transfers-in with memo 'Auto Funded' (the Fund Categories flow),
//   NOT categories.monthly_amount, which is a current target with no history.
//   An auto-funded transfer that lands on a carried-in negative balance still
//   counts as budget, not a rescue — so a carried deficit can flip to fixed in
//   the next month with totalFixed = 0.
// - The pool side of a transfer appears two ways: NULL category id (manual
//   transfers) or the 'Available to Budget' system category (auto-funding).
//   Both are treated as pool-side.
// - An event's DATE decides which month it belongs to, but within a month
//   events replay in ENTRY order (created_at). This is what makes fix detection
//   match reality: a rescue transfer is usually entered while the overspending
//   transactions are still pending (entered earlier, settling later), so
//   date-ordered replay would put the rescue before the spend and hide the dip.
//   In entry order the dip is visible when the rescue arrives. Conversely, a
//   planned purchase pre-funded before the spend was entered (e.g. moving $545
//   for a robot vacuum, then buying it) never dips, so no phantom deficit.
//   Rank (auto-funded, transactions, transfers-in, transfers-out) only breaks
//   created_at ties, e.g. bulk-imported rows.
// - A manual (non-auto-funded) transfer-in that lands while the balance is
//   negative is a fix; while positive it is ordinary funding.

const AUTO_FUNDED_MEMO = 'Auto Funded';

const round2 = (n) => Math.round(n * 100) / 100;

// Same-day ordering rank (see heuristic note above)
function eventRank(ev) {
    if (ev.kind === 'transfer_in') {
        return ev.memo === AUTO_FUNDED_MEMO ? 0 : 2;
    }
    if (ev.kind === 'transaction') return 1;
    return 3; // transfer_out
}

// All envelope events (transfers in/out, settled transactions) dated
// <= throughDate, grouped by category id, in chronological walk order.
// Signs are normalized so a running balance is just `bal += ev.amount`.
// With includePending, pending transactions join the walk as current-month
// events dated today (they always count as current-month activity, dashboard
// parity) — so an overspend that is fixed while the spend is still pending is
// visible immediately, not only once the transaction settles.
function loadEventsByCategory(throughDate, includePending = false) {
    const events = db.prepare(`
        SELECT to_category_id AS cid, date, amount, 'transfer_in' AS kind, id,
               from_category_id AS counterpart_id, memo, created_at, 0 AS is_pending
        FROM category_transfers
        WHERE to_category_id IS NOT NULL AND date <= ?
        UNION ALL
        SELECT from_category_id AS cid, date, -amount AS amount, 'transfer_out' AS kind, id,
               to_category_id AS counterpart_id, memo, created_at, 0 AS is_pending
        FROM category_transfers
        WHERE from_category_id IS NOT NULL AND date <= ?
        UNION ALL
        SELECT category_id AS cid, date, amount, 'transaction' AS kind, id,
               NULL AS counterpart_id, memo, created_at, 0 AS is_pending
        FROM transactions
        WHERE category_id IS NOT NULL AND status = 'settled' AND date <= ?
    `).all(throughDate, throughDate, throughDate);

    if (includePending) {
        const today = localToday();
        const pending = db.prepare(`
            SELECT category_id AS cid, amount, id, memo, created_at
            FROM transactions
            WHERE category_id IS NOT NULL AND status = 'pending'
        `).all();
        for (const p of pending) {
            events.push({
                cid: p.cid, date: today, amount: p.amount, kind: 'transaction',
                id: p.id, counterpart_id: null, memo: p.memo,
                created_at: p.created_at, is_pending: 1,
            });
        }
    }

    // Month by date, entry order (created_at) within the month — see header note
    events.sort((a, b) =>
        a.date.slice(0, 7).localeCompare(b.date.slice(0, 7)) ||
        String(a.created_at).localeCompare(String(b.created_at)) ||
        eventRank(a) - eventRank(b) ||
        a.id - b.id
    );

    const byCategory = new Map();
    for (const ev of events) {
        if (!byCategory.has(ev.cid)) byCategory.set(ev.cid, []);
        byCategory.get(ev.cid).push(ev);
    }
    return byCategory;
}

function getCategories() {
    // All categories (system ones included) for counterpart naming; only
    // non-system ones are walked as envelopes.
    const all = db.prepare('SELECT id, name, icon, is_system, monthly_amount FROM categories').all();
    const byId = new Map(all.map((c) => [c.id, c]));
    const envelopes = all.filter((c) => !c.is_system);
    return { byId, envelopes };
}

// Categories without a fixed monthly budget (monthly_amount = 0) are funded
// ad hoc: they routinely dip negative and get covered the same day, which is
// workflow, not overspending. They only count as deficits when a month ENDS
// negative — that is real uncovered overspending dragging Ready to Assign.
function countsAsDeficit(category, outcome) {
    return category.monthly_amount > 0 || outcome !== 'fixed';
}

// Pending transactions always count as current-month activity, regardless of
// their date (dashboard parity).
function getPendingByCategory() {
    const rows = db.prepare(`
        SELECT category_id AS cid, COALESCE(SUM(amount), 0) AS total
        FROM transactions
        WHERE status = 'pending' AND category_id IS NOT NULL
        GROUP BY category_id
    `).all();
    return new Map(rows.map((r) => [r.cid, r.total]));
}

// GET /api/deficits/history - heatmap data: per category x month deficit outcomes
router.get('/history', (req, res) => {
    try {
        const currentMonth = currentYearMonth();
        const { end: currentEnd } = monthRange(currentMonth);
        const eventsByCategory = loadEventsByCategory(currentEnd, true);
        const { envelopes } = getCategories();

        // Month axis: first event month through the current month
        let firstMonth = currentMonth;
        for (const events of eventsByCategory.values()) {
            if (events.length && events[0].date.slice(0, 7) < firstMonth) {
                firstMonth = events[0].date.slice(0, 7);
            }
        }
        const months = [];
        for (let m = firstMonth; m <= currentMonth; m = shiftMonth(m, 1)) {
            months.push(m);
        }

        const categories = [];
        for (const cat of envelopes) {
            const events = eventsByCategory.get(cat.id) || [];
            if (!events.length) continue;

            const cells = {};
            let lastDeficitMonth = null;
            let bal = 0;
            let i = 0;
            for (const month of months) {
                if (month < events[0].date.slice(0, 7)) continue;
                let minBal = bal;
                while (i < events.length && events[i].date.slice(0, 7) === month) {
                    bal += events[i].amount;
                    if (bal < minBal) minBal = bal;
                    i++;
                }
                const isCurrent = month === currentMonth;
                const endEffective = bal; // pending already replayed in the walk
                const monthDeficit = Math.max(0, -minBal);
                if (monthDeficit > 0.005 || endEffective < -0.005) {
                    let outcome;
                    if (endEffective < -0.005) {
                        outcome = isCurrent ? 'open' : 'carried';
                    } else {
                        outcome = 'fixed';
                    }
                    if (countsAsDeficit(cat, outcome)) {
                        cells[month] = {
                            outcome,
                            peakDeficit: round2(Math.max(monthDeficit, -endEffective, 0)),
                            endBalance: round2(bal),
                        };
                        lastDeficitMonth = month;
                    }
                }
            }

            if (lastDeficitMonth) {
                categories.push({
                    id: cat.id,
                    name: cat.name,
                    icon: cat.icon,
                    lastDeficitMonth,
                    cells,
                });
            }
        }

        categories.sort(
            (a, b) =>
                b.lastDeficitMonth.localeCompare(a.lastDeficitMonth) ||
                a.name.localeCompare(b.name)
        );

        res.json({ currentMonth, months, categories });
    } catch (error) {
        console.error('Error building deficit history:', error);
        res.status(500).json({ error: 'Failed to build deficit history' });
    }
});

// GET /api/deficits/month/:yearMonth - full case files for one month
router.get('/month/:yearMonth', (req, res) => {
    try {
        const { yearMonth } = req.params;
        if (!/^\d{4}-\d{2}$/.test(yearMonth) || +yearMonth.slice(5) < 1 || +yearMonth.slice(5) > 12) {
            return res.status(400).json({ error: 'Invalid month, expected YYYY-MM' });
        }

        const currentMonth = currentYearMonth();
        const isCurrentMonth = yearMonth === currentMonth;
        const { start: monthStart, end: monthEnd } = monthRange(yearMonth);
        const eventsByCategory = loadEventsByCategory(monthEnd, isCurrentMonth);
        const { byId, envelopes } = getCategories();
        const pendingByCategory = isCurrentMonth ? getPendingByCategory() : new Map(); // for the pendingActivity stat

        const results = [];
        for (const cat of envelopes) {
            const events = eventsByCategory.get(cat.id) || [];
            const pendingSum = pendingByCategory.get(cat.id) || 0;

            let bal = 0;
            let carriedIn = 0;
            let minBal = null; // in-month running minimum, seeded with carriedIn
            let budgeted = 0;
            let otherFundingIn = 0;
            let transfersOut = 0;
            let spent = 0;
            let refunds = 0;
            let tippingTransactionId = null;
            const fixes = [];
            const transactions = [];

            for (const ev of events) {
                const inMonth = ev.date >= monthStart;
                if (inMonth && minBal === null) {
                    carriedIn = bal;
                    minBal = bal;
                }
                const balanceBefore = bal;
                bal += ev.amount;
                if (!inMonth) continue;
                if (bal < minBal) minBal = bal;

                if (ev.kind === 'transaction') {
                    transactions.push({
                        id: ev.id,
                        date: ev.is_pending ? null : ev.date,
                        amount: ev.amount,
                        memo: ev.memo,
                        status: ev.is_pending ? 'pending' : 'settled',
                        isTipping: false,
                    });
                    if (ev.amount < 0) spent += -ev.amount;
                    else refunds += ev.amount;
                    if (tippingTransactionId === null && balanceBefore >= 0 && bal < 0) {
                        tippingTransactionId = ev.id;
                    }
                } else if (ev.kind === 'transfer_out') {
                    transfersOut += -ev.amount;
                } else if (ev.memo === AUTO_FUNDED_MEMO) {
                    budgeted += ev.amount;
                } else if (balanceBefore < -0.005) {
                    const from = ev.counterpart_id ? byId.get(ev.counterpart_id) : null;
                    fixes.push({
                        id: ev.id,
                        date: ev.date,
                        amount: round2(ev.amount),
                        amountApplied: round2(Math.min(ev.amount, -balanceBefore)),
                        fromCategoryId: ev.counterpart_id ?? null,
                        fromCategoryName: from ? from.name : null,
                        memo: ev.memo,
                    });
                } else {
                    otherFundingIn += ev.amount;
                }
            }

            // Months with no in-month events still carry the running balance
            if (minBal === null) {
                carriedIn = bal;
                minBal = bal;
            }

            const endBalance = bal;
            const endEffective = endBalance; // pending already replayed in the walk
            const monthDeficit = Math.max(0, -minBal);
            const hadDeficit = monthDeficit > 0.005 || endEffective < -0.005;
            if (!hadDeficit) continue;
            // Unbudgeted (ad hoc) categories only count when the month ends negative
            if (!countsAsDeficit(cat, endEffective < -0.005 ? 'open' : 'fixed')) continue;

            transactions.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
            for (const t of transactions) {
                if (t.id === tippingTransactionId) t.isTipping = true;
            }

            const remainingDeficit = round2(Math.max(0, -endEffective));
            let status;
            if (remainingDeficit === 0) status = 'fixed';
            else if (fixes.length > 0) status = 'partial';
            else status = 'unfixed';

            results.push({
                id: cat.id,
                name: cat.name,
                icon: cat.icon,
                status,
                carriedIn: round2(carriedIn),
                budgeted: round2(budgeted),
                otherFundingIn: round2(otherFundingIn),
                transfersOut: round2(transfersOut),
                spent: round2(spent),
                refunds: round2(refunds),
                pendingActivity: round2(pendingSum),
                peakDeficit: round2(Math.max(monthDeficit, -endEffective, 0)),
                endBalance: round2(endBalance),
                remainingDeficit,
                tippingTransactionId,
                transactions,
                fixes,
            });
        }

        results.sort((a, b) => b.peakDeficit - a.peakDeficit || a.name.localeCompare(b.name));

        const summary = {
            totalOverspent: round2(results.reduce((s, r) => s + r.peakDeficit, 0)),
            totalFixed: round2(
                results.reduce((s, r) => s + r.fixes.reduce((fs, f) => fs + f.amountApplied, 0), 0)
            ),
            netCarriedForward: round2(results.reduce((s, r) => s + r.remainingDeficit, 0)),
            categoriesOver: results.length,
        };

        res.json({ month: yearMonth, isCurrentMonth, summary, categories: results });
    } catch (error) {
        console.error('Error building deficit month detail:', error);
        res.status(500).json({ error: 'Failed to build deficit detail' });
    }
});

export default router;
