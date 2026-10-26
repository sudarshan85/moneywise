/**
 * The engine every MCP write goes through.
 *
 * A write tool is a function `apply(input, rec)` that changes rows only via
 * the recorder `rec`, which keeps a full before/after image of each row. That
 * one mechanism gives us:
 * - preview: run the write in a transaction, measure, then roll it back;
 * - the write log (`mcp_writes`), with exactly what changed;
 * - undo: replay the recorded images in reverse.
 * Every committed write is preceded by a database backup ('premcp').
 *
 * A write may also have a file side effect (icon uploads): `apply` describes it
 * in `effects` and performs it in `commit()`, which runs only on a real write.
 */

import db from '../db/database.js';
import { buildDashboardData, buildReadyToAssign } from '../services/budgetMath.js';
import { performDatabaseBackup } from '../services/backupScheduler.js';
import { displayName } from './resolve.js';

// The only tables a write may touch.
const TABLES = new Set(['transactions', 'category_transfers', 'categories', 'category_rename_history']);
const HAS_UPDATED_AT = new Set(['transactions', 'category_transfers', 'categories']);

class Rollback extends Error {}

function getRow(table, id) {
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) ?? null;
}

function checkTable(table) {
    if (!TABLES.has(table)) throw new Error(`Writes to ${table} are not allowed`);
}

function makeRecorder(changes) {
    return {
        get: getRow,

        insert(table, values) {
            checkTable(table);
            const cols = Object.keys(values);
            const info = db.prepare(
                `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
            ).run(...cols.map(c => values[c]));
            const after = getRow(table, Number(info.lastInsertRowid));
            changes.push({ table, id: after.id, before: null, after });
            return after;
        },

        // `touch: false` writes the values verbatim (undo restores updated_at too).
        update(table, id, values, { touch = true } = {}) {
            checkTable(table);
            const before = getRow(table, id);
            if (!before) throw new Error(`No ${table} row with id ${id}`);
            const cols = Object.keys(values);
            const sets = cols.map(c => `${c} = ?`);
            if (touch && HAS_UPDATED_AT.has(table)) sets.push('updated_at = CURRENT_TIMESTAMP');
            db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...cols.map(c => values[c]), id);
            const after = getRow(table, id);
            changes.push({ table, id, before, after });
            return after;
        },

        delete(table, id) {
            checkTable(table);
            const before = getRow(table, id);
            if (!before) throw new Error(`No ${table} row with id ${id}`);
            db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
            changes.push({ table, id, before, after: null });
            return before;
        }
    };
}

// ---------- balances before -> after ----------

function measure() {
    const envelopes = {};
    for (const c of buildDashboardData(db).categories) envelopes[c.id] = c.available;
    const accounts = {};
    for (const a of db.prepare(`
        SELECT a.id, ROUND(COALESCE(SUM(t.amount), 0), 2) AS balance
        FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
        GROUP BY a.id
    `).all()) accounts[a.id] = a.balance;
    return {
        envelopes,
        accounts,
        readyToAssign: Math.round(buildReadyToAssign(db).balance * 100) / 100
    };
}

// Categories and accounts the changed rows point at, before or after.
function touched(changes) {
    const categories = new Set();
    const accounts = new Set();
    for (const { table, id, before, after } of changes) {
        for (const row of [before, after]) {
            if (!row) continue;
            if (table === 'transactions') {
                if (row.category_id) categories.add(row.category_id);
                if (row.account_id) accounts.add(row.account_id);
            } else if (table === 'category_transfers') {
                if (row.from_category_id) categories.add(row.from_category_id);
                if (row.to_category_id) categories.add(row.to_category_id);
            } else if (table === 'categories') {
                categories.add(id);
            }
        }
    }
    return { categories, accounts };
}

function compareBalances(before, after, changes) {
    const { categories, accounts } = touched(changes);
    const names = table => Object.fromEntries(db.prepare(`SELECT id, name FROM ${table}`).all().map(r => [r.id, r.name]));
    const categoryNames = names('categories');
    const accountNames = names('accounts');

    const envelopes = [...categories]
        .filter(id => id in before.envelopes || id in after.envelopes)
        .map(id => ({
            envelope: displayName(categoryNames[id] ?? `#${id}`),
            before: before.envelopes[id] ?? null,
            after: after.envelopes[id] ?? null
        }));
    const accountRows = [...accounts].map(id => ({
        account: accountNames[id] ?? `#${id}`,
        before: before.accounts[id] ?? null,
        after: after.accounts[id] ?? null
    }));
    return {
        envelopes,
        accounts: accountRows,
        readyToAssign: { before: before.readyToAssign, after: after.readyToAssign }
    };
}

// What changed, readably: whole rows for inserts/deletes, changed fields for updates.
function describeChanges(changes) {
    return changes.map(({ table, id, before, after }) => {
        if (!before) return { action: 'insert', table, id, row: after };
        if (!after) return { action: 'delete', table, id, row: before };
        const fields = {};
        for (const key of Object.keys(after)) {
            if (key !== 'updated_at' && before[key] !== after[key]) fields[key] = { before: before[key], after: after[key] };
        }
        return { action: 'update', table, id, memo: after.memo ?? after.name ?? null, fields };
    });
}

// Keeps the log readable: uploaded image data is recorded by size only.
const logValue = (key, value) => (key === 'png_base64' ? `<${String(value).length} base64 chars>` : value);

/**
 * Run `apply(input, rec)` as one write.
 * `apply` returns { summary, warnings?, undoOf?, effects?, commit?, rollback? }.
 * Dry run: everything happens, then rolls back; nothing is logged or backed up.
 */
export function runWrite({ tool, input, dryRun }, apply) {
    if (!dryRun) {
        const backup = performDatabaseBackup('premcp');
        if (!backup.success) {
            throw new Error(`Write cancelled: the backup before it failed (${backup.error})`);
        }
    }

    const changes = [];
    let outcome;
    try {
        db.transaction(() => {
            const before = measure();
            const result = apply(input, makeRecorder(changes));
            if (changes.length === 0 && !result?.effects?.length) {
                throw new Error(result?.summary || 'Nothing to change');
            }

            outcome = {
                summary: result.summary,
                ...(result.warnings?.length ? { warnings: result.warnings } : {}),
                ...(result.effects?.length ? { effects: result.effects } : {})
            };
            if (changes.length) {
                outcome.changes = describeChanges(changes);
                outcome.balances = compareBalances(before, measure(), changes);
            }

            if (dryRun) throw new Rollback();

            result.commit?.();
            let log;
            try {
                log = db.prepare(`
                    INSERT INTO mcp_writes (tool, input, summary, changes, undo_of)
                    VALUES (?, ?, ?, ?, ?)
                `).run(tool, JSON.stringify(input, logValue), result.summary, JSON.stringify(changes), result.undoOf ?? null);
            } catch (err) {
                result.rollback?.();
                throw err;
            }
            if (result.undoOf) {
                db.prepare('UPDATE mcp_writes SET undone_at = CURRENT_TIMESTAMP WHERE id = ?').run(result.undoOf);
            }
            outcome.write_id = Number(log.lastInsertRowid);
        })();
    } catch (err) {
        if (!(err instanceof Rollback)) throw err;
    }

    return dryRun
        ? { preview: true, note: 'Nothing was written. Show this to Sudarshan and commit only if he agrees.', ...outcome }
        : { committed: true, ...outcome };
}

// ---------- undo ----------

// Writes whose effect is a file, not rows; they are reversed by their own tools.
const FILE_TOOLS = new Set(['add_moneywise_icon', 'delete_moneywise_icon']);

const sameRow = (a, b) => Object.keys(a).every(k => k === 'updated_at' || a[k] === b[k]);

/** An `apply` for runWrite that reverses a logged write. */
export function undoWrite({ write_id }, rec) {
    const entry = db.prepare('SELECT * FROM mcp_writes WHERE id = ?').get(write_id);
    if (!entry) throw new Error(`No write with write_id ${write_id}`);
    if (entry.undone_at) throw new Error(`Write ${write_id} was already undone at ${entry.undone_at}`);
    if (FILE_TOOLS.has(entry.tool)) {
        throw new Error(`Write ${write_id} is an icon change (${entry.tool}); use delete_moneywise_icon or add_moneywise_icon instead.`);
    }

    const changes = JSON.parse(entry.changes);
    for (const { table, id, before, after } of [...changes].reverse()) {
        const current = getRow(table, id);

        if (after) {
            // The row must still be exactly what this write left behind.
            if (!current || !sameRow(after, current)) {
                throw new Error(
                    `Cannot undo write ${write_id}: ${table} row ${id} has changed since (or was deleted). ` +
                    'Fix it by hand in the web app or with a new write.'
                );
            }
        } else if (current) {
            throw new Error(`Cannot undo write ${write_id}: ${table} row ${id} exists again.`);
        }

        if (!before) {
            if (table === 'categories') {
                const used = db.prepare(`
                    SELECT (SELECT COUNT(*) FROM transactions WHERE category_id = ?)
                         + (SELECT COUNT(*) FROM category_transfers WHERE from_category_id = ? OR to_category_id = ?) AS n
                `).get(id, id, id).n;
                if (used > 0) {
                    throw new Error(`Cannot undo write ${write_id}: category ${id} now has ${used} transactions or transfers.`);
                }
            }
            rec.delete(table, id);
        } else if (!after) {
            rec.insert(table, before);
        } else {
            const { id: _id, ...values } = before;
            rec.update(table, id, values, { touch: false });
        }
    }

    return { summary: `Undid write ${write_id} (${entry.tool}: ${entry.summary})`, undoOf: write_id };
}
