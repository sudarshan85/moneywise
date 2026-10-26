/**
 * The MCP write tools. One operation per tool, so each can get its own
 * permission in Claude desktop. Each handler takes names (resolved here),
 * validates, and changes rows only through the recorder from writes.js.
 *
 * Recording conventions follow Sudarshan's own data (see docs/moneywise.md §6):
 * spending is a negative amount; a pending charge has no date; an account
 * move is an 'Account Transfer' row out plus a 'Balance Change' row in.
 */

import { z } from 'zod';
import db from '../db/database.js';
import { buildDashboardData } from '../services/budgetMath.js';
import { localToday } from '../utils/dates.js';
import { WRITE_RULES_SHORT } from './rules.js';
import { runWrite, undoWrite } from './writes.js';
import { textResult, errorResult } from './results.js';
import {
    READY_TO_ASSIGN, ACCOUNT_TRANSFER, BALANCE_CHANGE,
    resolveCategory, resolveAccount, systemCategoryId, categoryName, accountName,
    displayName, cents, checkDate
} from './resolve.js';

const DUPLICATE_WINDOW_DAYS = 3;

const money = n => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
const signed = (amount, direction) => (direction === 'in' ? amount : -amount);

function shiftDays(date, days) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthLabel(date) {
    return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function describeTransaction(t) {
    return `#${t.id} ${t.memo || '(no memo)'} ${money(t.amount)} on ${accountName(t.account_id)}` +
        ` in ${categoryName(t.category_id) ?? 'no category'} (${t.date ?? 'pending'})`;
}

// Rows the app keeps in lockstep (linked account transfers) are edited in the web app.
function loadTransaction(rec, id) {
    const row = rec.get('transactions', id);
    if (!row) throw new Error(`No transaction with id ${id}`);
    if (row.transfer_pair_id) {
        throw new Error(`Transaction ${id} is one leg of a linked account transfer; change it in the web app.`);
    }
    return row;
}

function loadTransfer(rec, id) {
    const row = rec.get('category_transfers', id);
    if (!row) throw new Error(`No envelope transfer with id ${id}`);
    return row;
}

const isLoan = account => account.type === 'loan';

// ---------- tool definitions ----------
// Each: title, description, inputSchema (zod shape), destructive?, apply(input, rec).

const direction = z.enum(['out', 'in']);

const WRITE_TOOLS = {
    add_moneywise_transaction: {
        title: 'Add a MoneyWise transaction',
        description:
            'Record one transaction. amount is positive; direction "out" (spending, the default) or "in" (refund, money in). ' +
            'With no date it is a pending charge (how card purchases are entered until they settle); with a date it is settled. ' +
            "memo is the merchant or a short description (e.g. 'Kroger'). Refuses likely duplicates unless allow_duplicate is true.",
        inputSchema: {
            amount: z.number().positive(),
            direction: direction.default('out'),
            account: z.string().describe("Account name, e.g. 'CO Venture' (alias 'card') or '360 Checking' (alias 'checking')"),
            category: z.string().describe("Envelope name, e.g. 'Groceries'; 'Balance Change' for refunds or interest"),
            memo: z.string().min(1),
            date: z.string().optional().describe('YYYY-MM-DD. Omit for a pending transaction.'),
            allow_duplicate: z.boolean().default(false)
        },
        apply({ amount, direction: dir, account, category, memo, date, allow_duplicate }, rec) {
            const value = signed(cents(amount), dir);
            const acct = resolveAccount(account);
            const cat = resolveCategory(category, { system: [BALANCE_CHANGE] });
            if (date) checkDate(date);

            const warnings = [];
            const similar = db.prepare(`
                SELECT * FROM transactions
                WHERE account_id = ? AND ROUND(amount, 2) = ? AND LOWER(TRIM(memo)) = LOWER(TRIM(?))
                  AND (status = 'pending' OR date >= ?)
            `).all(acct.id, value, memo, shiftDays(localToday(), -DUPLICATE_WINDOW_DAYS));
            if (similar.length > 0) {
                const list = similar.map(describeTransaction).join('; ');
                if (!allow_duplicate) {
                    throw new Error(`Looks like a duplicate of ${list}. Ask Sudarshan; pass allow_duplicate: true if it is a separate charge.`);
                }
                warnings.push(`Similar existing transaction(s): ${list}`);
            }

            const row = rec.insert('transactions', {
                date: date ?? null,
                amount: value,
                account_id: acct.id,
                category_id: cat.id,
                memo: memo.trim(),
                status: date ? 'settled' : 'pending',
                type: 'regular'
            });
            return { summary: `Added ${describeTransaction(row)}`, warnings };
        }
    },

    settle_moneywise_transactions: {
        title: 'Settle pending MoneyWise transactions',
        description:
            "Mark pending transactions as settled. A row with no date gets today's date unless settle_date is given. " +
            'Rows that are already settled are skipped (never un-settled).',
        inputSchema: {
            ids: z.array(z.number().int()).min(1),
            settle_date: z.string().optional().describe('YYYY-MM-DD for rows that have no date; default today')
        },
        apply({ ids, settle_date }, rec) {
            const date = settle_date ? checkDate(settle_date, 'settle_date') : localToday();
            const settled = [];
            const skipped = [];
            for (const id of ids) {
                const row = loadTransaction(rec, id);
                if (row.status !== 'pending') {
                    skipped.push(`#${id} already settled`);
                    continue;
                }
                rec.update('transactions', id, { status: 'settled', date: row.date ?? date });
                settled.push(`#${id}`);
            }
            if (settled.length === 0) return { summary: `Nothing to settle: ${skipped.join(', ')}` };
            return {
                summary: `Settled ${settled.join(', ')}`,
                warnings: skipped.length ? [`Skipped: ${skipped.join(', ')}`] : []
            };
        }
    },

    move_moneywise_envelope_money: {
        title: 'Move money between MoneyWise envelopes',
        description:
            "Transfer money from one envelope to another. Use 'Ready to Assign' to fund an envelope from unassigned money or " +
            'to return money to it. If the receiving envelope is negative and no memo is given, the memo is ' +
            "'Cover <Envelope> deficit (<Mon YYYY>)'. date defaults to today.",
        inputSchema: {
            from_category: z.string(),
            to_category: z.string(),
            amount: z.number().positive(),
            memo: z.string().optional(),
            date: z.string().optional().describe('YYYY-MM-DD; default today')
        },
        apply({ from_category, to_category, amount, memo, date }, rec) {
            const value = cents(amount);
            const from = resolveCategory(from_category, { system: [READY_TO_ASSIGN] });
            const to = resolveCategory(to_category, { system: [READY_TO_ASSIGN] });
            if (from.id === to.id) throw new Error('From and to are the same envelope');
            const day = date ? checkDate(date) : localToday();

            let note = memo?.trim() || null;
            if (!note && from.name !== READY_TO_ASSIGN) {
                const available = buildDashboardData(db).categories.find(c => c.id === to.id)?.available;
                if (available < 0) note = `Cover ${to.name} deficit (${monthLabel(day)})`;
            }

            const row = rec.insert('category_transfers', {
                date: day, from_category_id: from.id, to_category_id: to.id, amount: value, memo: note
            });
            return {
                summary: `Moved ${money(value)} from ${displayName(from.name)} to ${displayName(to.name)} on ${day}` +
                    ` (transfer #${row.id}${note ? `, memo '${note}'` : ''})`
            };
        }
    },

    record_moneywise_account_transfer: {
        title: 'Record a MoneyWise account transfer',
        description:
            'Record money moving between two of his accounts (e.g. paying the card from checking, moving cash to RH Savings). ' +
            "Writes the usual pair: an 'Account Transfer' row taking the amount out of from_account (with memo, e.g. 'CO Bill'), " +
            "and a 'Balance Change' row adding it to to_account (with to_memo, blank by default). Settled on date (default today). " +
            'Loan accounts are refused: their principal change is not the payment amount.',
        inputSchema: {
            from_account: z.string(),
            to_account: z.string(),
            amount: z.number().positive(),
            memo: z.string().min(1).describe("Memo on the paying account, e.g. 'CO Bill', 'To RH Savings'"),
            to_memo: z.string().optional().describe('Memo on the receiving account; blank by default'),
            date: z.string().optional().describe('YYYY-MM-DD; default today')
        },
        apply({ from_account, to_account, amount, memo, to_memo, date }, rec) {
            const value = cents(amount);
            const from = resolveAccount(from_account);
            const to = resolveAccount(to_account);
            if (from.id === to.id) throw new Error('From and to are the same account');
            if (isLoan(from) || isLoan(to)) {
                throw new Error('Loan payments are not supported here: record the payment and the principal change in the web app.');
            }
            const day = date ? checkDate(date) : localToday();

            const out = rec.insert('transactions', {
                date: day, amount: -value, account_id: from.id, category_id: systemCategoryId(ACCOUNT_TRANSFER),
                memo: memo.trim(), status: 'settled', type: 'regular'
            });
            const into = rec.insert('transactions', {
                date: day, amount: value, account_id: to.id, category_id: systemCategoryId(BALANCE_CHANGE),
                memo: to_memo?.trim() || null, status: 'settled', type: 'regular'
            });
            return { summary: `Moved ${money(value)} from ${from.name} to ${to.name} on ${day} (transactions #${out.id}, #${into.id})` };
        }
    },

    recategorize_moneywise_transactions: {
        title: 'Recategorize MoneyWise transactions',
        description:
            'Move transactions to a different envelope (category). Amounts, dates and accounts are unchanged, so account ' +
            'balances stay the same; envelope balances shift. Rows already in that category are skipped.',
        inputSchema: {
            ids: z.array(z.number().int()).min(1),
            to_category: z.string()
        },
        apply({ ids, to_category }, rec) {
            const cat = resolveCategory(to_category, { system: [BALANCE_CHANGE, ACCOUNT_TRANSFER] });
            const moved = [];
            const skipped = [];
            for (const id of ids) {
                const row = loadTransaction(rec, id);
                if (row.category_id === cat.id) {
                    skipped.push(`#${id}`);
                    continue;
                }
                rec.update('transactions', id, { category_id: cat.id });
                moved.push(`#${id}`);
            }
            if (moved.length === 0) return { summary: `All already in ${cat.name}: ${skipped.join(', ')}` };
            return {
                summary: `Moved ${moved.join(', ')} to ${cat.name}`,
                warnings: skipped.length ? [`Already in ${cat.name}: ${skipped.join(', ')}`] : []
            };
        }
    },

    edit_moneywise_transaction: {
        title: 'Edit a MoneyWise transaction',
        description:
            'Change the memo, account, date or amount of one transaction. amount and direction must be given together. ' +
            'Pending rows have no date: settle them with settle_moneywise_transactions instead. ' +
            'To change the envelope use recategorize_moneywise_transactions.',
        inputSchema: {
            id: z.number().int(),
            memo: z.string().optional(),
            account: z.string().optional(),
            date: z.string().optional().describe('YYYY-MM-DD; settled rows only'),
            amount: z.number().positive().optional(),
            direction: direction.optional()
        },
        apply({ id, memo, account, date, amount, direction: dir }, rec) {
            const row = loadTransaction(rec, id);
            const values = {};
            if ((amount === undefined) !== (dir === undefined)) {
                throw new Error('Give amount and direction together');
            }
            if (amount !== undefined) values.amount = signed(cents(amount), dir);
            if (memo !== undefined) values.memo = memo.trim() || null;
            if (account !== undefined) values.account_id = resolveAccount(account).id;
            if (date !== undefined) {
                if (row.status === 'pending') {
                    throw new Error('This transaction is pending (no date). Use settle_moneywise_transactions with settle_date.');
                }
                values.date = checkDate(date);
            }
            if (Object.keys(values).length === 0) throw new Error('Nothing to change');
            const after = rec.update('transactions', id, values);
            return { summary: `Edited ${describeTransaction(after)}` };
        }
    },

    edit_moneywise_envelope_transfer: {
        title: 'Edit a MoneyWise envelope transfer',
        description: 'Change the envelopes, amount, date or memo of one envelope transfer (category_transfers row).',
        inputSchema: {
            id: z.number().int(),
            from_category: z.string().optional(),
            to_category: z.string().optional(),
            amount: z.number().positive().optional(),
            date: z.string().optional(),
            memo: z.string().optional()
        },
        apply({ id, from_category, to_category, amount, date, memo }, rec) {
            const row = loadTransfer(rec, id);
            const values = {};
            if (from_category !== undefined) values.from_category_id = resolveCategory(from_category, { system: [READY_TO_ASSIGN] }).id;
            if (to_category !== undefined) values.to_category_id = resolveCategory(to_category, { system: [READY_TO_ASSIGN] }).id;
            if (amount !== undefined) values.amount = cents(amount);
            if (date !== undefined) values.date = checkDate(date);
            if (memo !== undefined) values.memo = memo.trim() || null;
            if (Object.keys(values).length === 0) throw new Error('Nothing to change');
            const fromId = values.from_category_id ?? row.from_category_id;
            const toId = values.to_category_id ?? row.to_category_id;
            if (fromId === toId) throw new Error('From and to would be the same envelope');
            const after = rec.update('category_transfers', id, values);
            return {
                summary: `Edited transfer #${id}: ${money(after.amount)} from ${categoryName(after.from_category_id)}` +
                    ` to ${categoryName(after.to_category_id)} on ${after.date}`
            };
        }
    },

    delete_moneywise_envelope_transfer: {
        title: 'Delete a MoneyWise envelope transfer',
        description: 'Delete one envelope transfer (category_transfers row). Can be reversed with undo_moneywise_write.',
        destructive: true,
        inputSchema: { id: z.number().int() },
        apply({ id }, rec) {
            const row = loadTransfer(rec, id);
            rec.delete('category_transfers', id);
            return {
                summary: `Deleted transfer #${id}: ${money(row.amount)} from ${categoryName(row.from_category_id)}` +
                    ` to ${categoryName(row.to_category_id)} on ${row.date}${row.memo ? ` ('${row.memo}')` : ''}`
            };
        }
    },

    create_moneywise_category: {
        title: 'Create a MoneyWise category',
        description: 'Create a new envelope. monthly_amount is its monthly target (0 = funded ad hoc).',
        inputSchema: {
            name: z.string().min(1),
            monthly_amount: z.number().min(0).default(0),
            icon: z.string().optional().describe("An emoji, e.g. '🎾'")
        },
        apply({ name, monthly_amount, icon }, rec) {
            const clean = name.trim();
            if (db.prepare('SELECT 1 FROM categories WHERE LOWER(name) = LOWER(?)').get(clean)) {
                throw new Error(`A category named "${clean}" already exists (it may be hidden)`);
            }
            const sortOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories WHERE is_system = 0').get().n;
            const row = rec.insert('categories', {
                name: clean, icon: icon || null, monthly_amount: Math.round(monthly_amount * 100) / 100, sort_order: sortOrder
            });
            return { summary: `Created category #${row.id} ${row.name} (target ${money(row.monthly_amount)}/month)` };
        }
    },

    update_moneywise_category: {
        title: 'Update a MoneyWise category',
        description: 'Rename a category, change its monthly target, or hide/unhide it. System categories cannot be changed.',
        inputSchema: {
            name: z.string(),
            new_name: z.string().optional(),
            monthly_amount: z.number().min(0).optional(),
            hidden: z.boolean().optional()
        },
        apply({ name, new_name, monthly_amount, hidden }, rec) {
            const cat = resolveCategory(name, { includeHidden: true });
            const values = {};
            if (new_name !== undefined && new_name.trim() !== cat.name) {
                const clean = new_name.trim();
                const clash = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id != ?').get(clean, cat.id);
                if (!clean || clash) throw new Error(`Cannot rename to "${clean}": empty or already used`);
                values.name = clean;
                rec.insert('category_rename_history', { category_id: cat.id, old_name: cat.name, new_name: clean });
            }
            if (monthly_amount !== undefined) values.monthly_amount = Math.round(monthly_amount * 100) / 100;
            if (hidden !== undefined) values.is_hidden = hidden ? 1 : 0;
            if (Object.keys(values).length === 0) throw new Error('Nothing to change');
            const after = rec.update('categories', cat.id, values);
            return {
                summary: `Updated category #${cat.id} ${after.name}: target ${money(after.monthly_amount)}/month` +
                    `${after.is_hidden ? ', hidden' : ''}`
            };
        }
    },

    delete_moneywise_category: {
        title: 'Delete a MoneyWise category',
        description: 'Delete a category that has no transactions and no transfers. Otherwise hide it with update_moneywise_category.',
        destructive: true,
        inputSchema: { name: z.string() },
        apply({ name }, rec) {
            const cat = resolveCategory(name, { includeHidden: true });
            const counts = db.prepare(`
                SELECT (SELECT COUNT(*) FROM transactions WHERE category_id = ?) AS transactions,
                       (SELECT COUNT(*) FROM category_transfers WHERE from_category_id = ? OR to_category_id = ?) AS transfers
            `).get(cat.id, cat.id, cat.id);
            if (counts.transactions > 0 || counts.transfers > 0) {
                throw new Error(
                    `${cat.name} has ${counts.transactions} transactions and ${counts.transfers} transfers; ` +
                    'hide it instead (update_moneywise_category with hidden: true).'
                );
            }
            for (const { id } of db.prepare('SELECT id FROM category_rename_history WHERE category_id = ?').all(cat.id)) {
                rec.delete('category_rename_history', id);
            }
            rec.delete('categories', cat.id);
            return { summary: `Deleted category #${cat.id} ${cat.name}` };
        }
    },

    undo_moneywise_write: {
        title: 'Undo a MoneyWise write',
        description:
            'Reverse one earlier write made through this connector, by its write_id. Refuses if any affected row has been ' +
            'changed since (e.g. edited in the web app). The write log is the mcp_writes table (query_moneywise).',
        destructive: true,
        inputSchema: { write_id: z.number().int() },
        apply: undoWrite
    }
};

function runTool(name, input, dryRun) {
    try {
        return textResult(runWrite({ tool: name, input, dryRun }, WRITE_TOOLS[name].apply));
    } catch (err) {
        console.error(`[mcp] ${name}${dryRun ? ' (preview)' : ''} failed: ${err.message}`);
        return errorResult(`${dryRun ? 'Preview' : 'Write'} failed: ${err.message}`);
    }
}

export function registerWriteTools(server) {
    server.registerTool(
        'preview_moneywise_write',
        {
            title: 'Preview a MoneyWise write',
            description:
                'Dry run of any MoneyWise write tool: does everything the tool would do, reports the rows that would change ' +
                'and the balances before -> after (envelopes, accounts, Ready to Assign), then rolls it all back. Nothing is ' +
                'written. Call this before every write and show Sudarshan the result. ' +
                `tool is one of: ${Object.keys(WRITE_TOOLS).join(', ')}; args are that tool's arguments.`,
            inputSchema: {
                tool: z.enum(Object.keys(WRITE_TOOLS)),
                args: z.record(z.string(), z.any()).describe("The arguments you would pass to the write tool")
            },
            annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
        },
        async ({ tool, args }) => {
            const parsed = z.object(WRITE_TOOLS[tool].inputSchema).strict().safeParse(args);
            if (!parsed.success) {
                return errorResult(`Invalid arguments for ${tool}: ${z.prettifyError(parsed.error)}`);
            }
            return runTool(tool, parsed.data, true);
        }
    );

    for (const [name, def] of Object.entries(WRITE_TOOLS)) {
        server.registerTool(
            name,
            {
                title: def.title,
                description: `${def.description} ${WRITE_RULES_SHORT}`,
                inputSchema: def.inputSchema,
                annotations: {
                    readOnlyHint: false,
                    destructiveHint: !!def.destructive,
                    idempotentHint: false,
                    openWorldHint: false
                }
            },
            async input => runTool(name, input, false)
        );
    }
}
