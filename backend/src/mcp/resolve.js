/**
 * Turns the names Claude uses ("groceries", "the card") into ids, and checks
 * the plain values (amounts, dates) the write tools take.
 *
 * Exact, case-insensitive matches plus a few aliases. Anything else is an
 * error listing the valid names: never guess with someone's money.
 */

import db from '../db/database.js';

export const READY_TO_ASSIGN = 'Available to Budget';
export const ACCOUNT_TRANSFER = 'Account Transfer';
export const BALANCE_CHANGE = 'Balance Change';

const CATEGORY_ALIASES = {
    'ready to assign': READY_TO_ASSIGN,
    rta: READY_TO_ASSIGN
};

const ACCOUNT_ALIASES = {
    card: 'CO Venture',
    'credit card': 'CO Venture',
    checking: '360 Checking'
};

export const displayName = name => (name === READY_TO_ASSIGN ? 'Ready to Assign' : name);

function findByName(rows, name, aliases, kind) {
    const wanted = String(name).trim().toLowerCase();
    const target = (aliases[wanted] || wanted).toLowerCase();
    const matches = rows.filter(r => r.name.toLowerCase() === target);
    if (matches.length === 1) return matches[0];
    const valid = rows.map(r => displayName(r.name)).join(', ');
    if (matches.length === 0) throw new Error(`No ${kind} named "${name}". Valid ${kind} names: ${valid}`);
    throw new Error(`"${name}" matches more than one ${kind}. Valid ${kind} names: ${valid}`);
}

/**
 * Resolve a category name to its row.
 * - `system`: system category names allowed here (e.g. [READY_TO_ASSIGN]).
 * - `includeHidden`: allow hidden categories (e.g. to unhide one).
 */
export function resolveCategory(name, { system = [], includeHidden = false } = {}) {
    const rows = db.prepare('SELECT * FROM categories ORDER BY is_system DESC, sort_order, name').all()
        .filter(c => (c.is_system ? system.includes(c.name) : includeHidden || !c.is_hidden));
    return findByName(rows, name, CATEGORY_ALIASES, 'category');
}

export function resolveAccount(name) {
    const rows = db.prepare('SELECT * FROM accounts WHERE is_hidden = 0 ORDER BY sort_order, name').all();
    return findByName(rows, name, ACCOUNT_ALIASES, 'account');
}

export function systemCategoryId(name) {
    const row = db.prepare('SELECT id FROM categories WHERE name = ? AND is_system = 1').get(name);
    if (!row) throw new Error(`System category "${name}" is missing`);
    return row.id;
}

export function categoryName(id) {
    if (id === null || id === undefined) return null;
    return displayName(db.prepare('SELECT name FROM categories WHERE id = ?').get(id)?.name ?? `#${id}`);
}

export function accountName(id) {
    if (id === null || id === undefined) return null;
    return db.prepare('SELECT name FROM accounts WHERE id = ?').get(id)?.name ?? `#${id}`;
}

// Positive dollar amount, rounded to cents.
export function cents(amount, field = 'amount') {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        throw new Error(`${field} must be a positive number`);
    }
    return Math.round(amount * 100) / 100;
}

export function checkDate(date, field = 'date') {
    // Rejects impossible days like 2026-02-30, which Date would roll over.
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(date)
        && new Date(`${date}T12:00:00`).getDate() === Number(date.slice(8, 10));
    if (!ok) throw new Error(`${field} must be a real date in YYYY-MM-DD form, got "${date}"`);
    return date;
}
