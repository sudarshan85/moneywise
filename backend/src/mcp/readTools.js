/**
 * The read-only MCP tools: the whole-database snapshot and ad-hoc SQL.
 *
 * The whole database is small (~900 transactions), so there is no sampling or
 * summarising: Claude gets every row and does its own analysis. The two
 * derived blocks come from services/budgetMath.js — the same code the app
 * runs — so Claude's numbers match what the Dashboard shows.
 */

import Database from 'better-sqlite3';
import { z } from 'zod';
import db, { getDatabasePath } from '../db/database.js';
import { buildDashboardData, buildReadyToAssign } from '../services/budgetMath.js';
import { localToday, currentYearMonth } from '../utils/dates.js';
import { listIcons } from '../services/icons.js';
import { CRITICAL_RULES } from './rules.js';
import { textResult, errorResult } from './results.js';

const MAX_QUERY_ROWS = 500;

const TRANSACTION_COLUMNS = ['id', 'date', 'amount', 'account_id', 'category_id', 'memo', 'status'];
const TRANSFER_COLUMNS = ['id', 'date', 'from_category_id', 'to_category_id', 'amount', 'memo'];

// Row-heavy tables are arrays-of-arrays with a separate column list, which is
// roughly half the size of repeating the keys on every row.
function buildSnapshot() {
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
        about: 'MoneyWise: Sudarshan\'s personal envelope-budgeting app. Live production data. Full explanation in moneywise.md (project knowledge), if available.',
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

// A second connection that SQLite itself keeps read-only, whatever SQL arrives.
let readOnlyDb = null;
function getReadOnlyDb() {
    if (!readOnlyDb) {
        readOnlyDb = new Database(getDatabasePath(), { readonly: true, fileMustExist: true });
        readOnlyDb.pragma('query_only = ON');
        readOnlyDb.pragma('busy_timeout = 5000');
    }
    return readOnlyDb;
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

export function registerReadTools(server) {
    server.registerTool(
        'get_financial_snapshot',
        {
            title: 'MoneyWise financial snapshot',
            description:
                "The complete MoneyWise database in one result: every account (with balances), every category (envelope) " +
                'with its monthly target, every transaction and envelope transfer, the current Ready to Assign breakdown, ' +
                "and the current month's dashboard (each envelope's available balance, activity and carried-forward). " +
                'Also includes the rules needed to read it correctly. Live data. Use this first for any overview, ' +
                'review or rundown of finances.',
            inputSchema: {},
            annotations: READ_ONLY
        },
        async () => {
            try {
                return textResult(buildSnapshot());
            } catch (err) {
                console.error('[mcp] snapshot failed:', err);
                return errorResult(`Could not build the MoneyWise snapshot: ${err.message}`);
            }
        }
    );

    server.registerTool(
        'query_moneywise',
        {
            title: 'Query MoneyWise (read-only SQL)',
            description:
                'Run one read-only SQLite query against the live MoneyWise database for detail the snapshot does not make easy. ' +
                'Tables: transactions(id, date, amount, account_id, category_id, memo, status, type, is_reconciliation_point, created_at) ' +
                "— amount < 0 is money out, date is NULL for pending; category_transfers(id, date, from_category_id, " +
                "to_category_id, amount, memo) — memo 'Auto Funded' is monthly funding; categories(id, name, monthly_amount, " +
                'is_system, is_hidden); accounts(id, name, type, in_moneypot, is_hidden); app_settings(key, value); ' +
                'mcp_writes(id, created_at, tool, input, summary, changes, undone_at, undo_of) — the log of writes made through ' +
                `this connector. Returns at most ${MAX_QUERY_ROWS} rows. Writes are refused.`,
            inputSchema: {
                sql: z.string().min(1).describe('A single SELECT (or WITH ... SELECT) statement.')
            },
            annotations: READ_ONLY
        },
        async ({ sql }) => {
            try {
                const stmt = getReadOnlyDb().prepare(sql);
                if (!stmt.reader) {
                    return errorResult('Only read-only queries that return rows are allowed.');
                }
                const rows = [];
                let truncated = false;
                for (const row of stmt.raw(true).iterate()) {
                    if (rows.length === MAX_QUERY_ROWS) {
                        truncated = true;
                        break;
                    }
                    rows.push(row);
                }
                return textResult({
                    columns: stmt.columns().map(c => c.name),
                    rows,
                    rowCount: rows.length,
                    truncated
                });
            } catch (err) {
                return errorResult(`Query failed: ${err.message}`);
            }
        }
    );

    server.registerTool(
        'list_moneywise_icons',
        {
            title: 'List MoneyWise icons',
            description:
                'Every icon available for categories and accounts: { name, path, source }. source is "builtin" (ships ' +
                'with the app) or "uploaded" (added with add_moneywise_icon). Use it to pick an icon before creating or ' +
                'updating a category, and to see whether a new icon has to be drawn.',
            inputSchema: {},
            annotations: READ_ONLY
        },
        async () => {
            try {
                return textResult(listIcons());
            } catch (err) {
                return errorResult(`Could not list icons: ${err.message}`);
            }
        }
    );
}
