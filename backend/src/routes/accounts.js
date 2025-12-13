import express from 'express';
import db from '../db/database.js';

const router = express.Router();

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
        const { name, type } = req.body;

        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }

        if (!['bank', 'credit_card'].includes(type)) {
            return res.status(400).json({ error: 'Type must be "bank" or "credit_card"' });
        }

        const result = db.prepare(`
            INSERT INTO accounts (name, type, sort_order)
            VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM accounts))
        `).run(name, type);

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
        const { name, type, is_hidden, sort_order } = req.body;
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
            if (!['bank', 'credit_card'].includes(type)) {
                return res.status(400).json({ error: 'Type must be "bank" or "credit_card"' });
            }
            updates.push('type = ?');
            values.push(type);
        }
        if (is_hidden !== undefined) {
            updates.push('is_hidden = ?');
            values.push(is_hidden ? 1 : 0);
        }
        if (sort_order !== undefined) {
            updates.push('sort_order = ?');
            values.push(sort_order);
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
