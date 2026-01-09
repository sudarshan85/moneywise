import express from 'express';
import db from '../db/database.js';

const router = express.Router();

// Valid account types
const VALID_ACCOUNT_TYPES = ['bank', 'credit_card', 'cash', 'investment', 'retirement', 'loan'];

// GET /api/accounts/moneypot - Get Available to Budget (MoneyPot balance minus allocated amounts)
router.get('/moneypot', (req, res) => {
    try {
        // Get sum of all account balances that are in MoneyPot
        const accountsResult = db.prepare(`
            SELECT COALESCE(SUM(t.amount), 0) as total_balance
            FROM accounts a
            LEFT JOIN transactions t ON t.account_id = a.id AND t.status = 'settled'
            WHERE a.in_moneypot = 1 AND a.is_hidden = 0
        `).get();

        // Get the Available to Budget category ID
        const availableToBudgetCategory = db.prepare(`
            SELECT id FROM categories WHERE name = 'Available to Budget' AND is_system = 1
        `).get();

        let transfersOut = 0;
        let transfersIn = 0;

        if (availableToBudgetCategory) {
            // Get sum of transfers OUT of Available to Budget (allocated to categories)
            const outResult = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM category_transfers
                WHERE from_category_id = ?
            `).get(availableToBudgetCategory.id);
            transfersOut = outResult.total;

            // Get sum of transfers INTO Available to Budget (returned from categories)
            const inResult = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM category_transfers
                WHERE to_category_id = ?
            `).get(availableToBudgetCategory.id);
            transfersIn = inResult.total;
        }

        // Available to Budget = Account balances - Transferred out + Transferred back in
        const availableToBudget = accountsResult.total_balance - transfersOut + transfersIn;

        res.json({
            balance: availableToBudget,
            accountBalance: accountsResult.total_balance,
            allocatedOut: transfersOut,
            returnedIn: transfersIn
        });
    } catch (error) {
        console.error('Error fetching Available to Budget:', error);
        res.status(500).json({ error: 'Failed to fetch Available to Budget' });
    }
});

// GET /api/accounts - Get all accounts
router.get('/', (req, res) => {
    try {
        const includeHidden = req.query.includeHidden === 'true';

        let query = 'SELECT * FROM accounts';
        if (!includeHidden) {
            query += ' WHERE is_hidden = 0';
        }
        query += ' ORDER BY sort_order, name';

        const accounts = db.prepare(query).all();
        res.json(accounts);
    } catch (error) {
        console.error('Error fetching accounts:', error);
        res.status(500).json({ error: 'Failed to fetch accounts' });
    }
});

// GET /api/accounts/:id - Get single account
router.get('/:id', (req, res) => {
    try {
        const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
        if (!account) {
            return res.status(404).json({ error: 'Account not found' });
        }
        res.json(account);
    } catch (error) {
        console.error('Error fetching account:', error);
        res.status(500).json({ error: 'Failed to fetch account' });
    }
});

// POST /api/accounts - Create new account
router.post('/', (req, res) => {
    try {
        const { name, type, icon, in_moneypot } = req.body;

        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }

        if (!VALID_ACCOUNT_TYPES.includes(type)) {
            return res.status(400).json({
                error: `Type must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`
            });
        }

        // Default in_moneypot based on account type if not specified
        const moneypotValue = in_moneypot !== undefined
            ? (in_moneypot ? 1 : 0)
            : (['bank', 'cash', 'investment', 'retirement'].includes(type) ? 1 : 0);

        const result = db.prepare(`
            INSERT INTO accounts (name, type, icon, in_moneypot, sort_order)
            VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM accounts))
        `).run(name, type, icon || null, moneypotValue);

        const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(account);
    } catch (error) {
        console.error('Error creating account:', error);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

// PATCH /api/accounts/:id - Update account
router.patch('/:id', (req, res) => {
    try {
        const { name, type, icon, is_hidden, sort_order, in_moneypot } = req.body;
        const id = req.params.id;

        // Check if account exists
        const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Account not found' });
        }

        // Build dynamic update
        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (type !== undefined) {
            if (!VALID_ACCOUNT_TYPES.includes(type)) {
                return res.status(400).json({
                    error: `Type must be one of: ${VALID_ACCOUNT_TYPES.join(', ')}`
                });
            }
            updates.push('type = ?');
            values.push(type);
        }
        if (icon !== undefined) {
            updates.push('icon = ?');
            values.push(icon || null);
        }
        if (is_hidden !== undefined) {
            updates.push('is_hidden = ?');
            values.push(is_hidden ? 1 : 0);
        }
        if (sort_order !== undefined) {
            updates.push('sort_order = ?');
            values.push(sort_order);
        }
        if (in_moneypot !== undefined) {
            updates.push('in_moneypot = ?');
            values.push(in_moneypot ? 1 : 0);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        db.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
        res.json(account);
    } catch (error) {
        console.error('Error updating account:', error);
        res.status(500).json({ error: 'Failed to update account' });
    }
});

// DELETE /api/accounts/:id - Delete account (only if no transactions)
router.delete('/:id', (req, res) => {
    try {
        const id = req.params.id;

        // Check if account exists
        const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Account not found' });
        }

        // Check for transactions
        const hasTransactions = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE account_id = ?').get(id);
        if (hasTransactions.count > 0) {
            return res.status(400).json({
                error: 'Cannot delete account with transactions. Hide it instead.',
                transactionCount: hasTransactions.count
            });
        }

        db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

export default router;
