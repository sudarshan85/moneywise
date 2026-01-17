import express from 'express';
import db from '../db/database.js';

const router = express.Router();

// ==================== GET /api/transactions ====================
// List transactions with optional filtering
router.get('/', (req, res) => {
    try {
        const {
            account_id,
            category_id,
            status,
            startDate,
            endDate,
            memo_search,
            limit = 100,
            offset = 0
        } = req.query;

        let query = `
            SELECT 
                t.*,
                a.name as account_name,
                a.icon as account_icon,
                a.type as account_type,
                c.name as category_name,
                c.icon as category_icon
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE 1=1
        `;
        const params = [];

        if (account_id) {
            query += ' AND t.account_id = ?';
            params.push(account_id);
        }

        if (category_id) {
            query += ' AND t.category_id = ?';
            params.push(category_id);
        }

        if (status) {
            query += ' AND t.status = ?';
            params.push(status);
        }

        if (startDate) {
            query += ' AND t.date >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += ' AND t.date <= ?';
            params.push(endDate);
        }

        if (memo_search) {
            query += ' AND LOWER(t.memo) LIKE ?';
            params.push(`%${memo_search.toLowerCase()}%`);
        }

        // Order: pending transactions first (NULL dates), then by date descending
        query += ' ORDER BY CASE WHEN t.date IS NULL THEN 0 ELSE 1 END, t.date DESC, t.created_at DESC';
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const transactions = db.prepare(query).all(...params);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM transactions t WHERE 1=1';
        const countParams = [];

        if (account_id) {
            countQuery += ' AND t.account_id = ?';
            countParams.push(account_id);
        }
        if (category_id) {
            countQuery += ' AND t.category_id = ?';
            countParams.push(category_id);
        }
        if (status) {
            countQuery += ' AND t.status = ?';
            countParams.push(status);
        }
        if (startDate) {
            countQuery += ' AND t.date >= ?';
            countParams.push(startDate);
        }
        if (endDate) {
            countQuery += ' AND t.date <= ?';
            countParams.push(endDate);
        }
        if (memo_search) {
            countQuery += ' AND LOWER(t.memo) LIKE ?';
            countParams.push(`%${memo_search.toLowerCase()}%`);
        }

        const { total } = db.prepare(countQuery).get(...countParams);

        res.json({
            transactions,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// ==================== GET /api/transactions/:id ====================
// Get single transaction
router.get('/:id', (req, res) => {
    try {
        const transaction = db.prepare(`
            SELECT 
                t.*,
                a.name as account_name,
                a.icon as account_icon,
                a.type as account_type,
                c.name as category_name,
                c.icon as category_icon
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.id = ?
        `).get(req.params.id);

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        res.json(transaction);
    } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).json({ error: 'Failed to fetch transaction' });
    }
});

// ==================== POST /api/transactions ====================
// Create new transaction
router.post('/', (req, res) => {
    try {
        const {
            date,
            amount,
            account_id,
            category_id,
            memo,
            status = 'settled',
            type = 'regular'
        } = req.body;

        // Validation - date is only required for settled transactions
        if (status === 'settled' && !date) {
            return res.status(400).json({
                error: 'Date is required for settled transactions'
            });
        }
        if (amount === undefined || !account_id) {
            return res.status(400).json({
                error: 'Amount and account_id are required'
            });
        }

        // Verify account exists
        const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(account_id);
        if (!account) {
            return res.status(400).json({ error: 'Account not found' });
        }

        // Verify category exists if provided
        if (category_id) {
            const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id);
            if (!category) {
                return res.status(400).json({ error: 'Category not found' });
            }
        }

        // Validate status
        if (!['settled', 'pending'].includes(status)) {
            return res.status(400).json({ error: 'Status must be settled or pending' });
        }

        // Validate type
        const validTypes = ['regular', 'account_transfer', 'balance_adjustment', 'starting_balance'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({
                error: `Type must be one of: ${validTypes.join(', ')}`
            });
        }

        const result = db.prepare(`
            INSERT INTO transactions (date, amount, account_id, category_id, memo, status, type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(date, amount, account_id, category_id || null, memo || null, status, type);

        const transaction = db.prepare(`
            SELECT 
                t.*,
                a.name as account_name,
                a.icon as account_icon,
                a.type as account_type,
                c.name as category_name,
                c.icon as category_icon
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.id = ?
        `).get(result.lastInsertRowid);

        res.status(201).json(transaction);
    } catch (error) {
        console.error('Error creating transaction:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
});

// ==================== POST /api/transactions/reconciliation ====================
// Create a global reconciliation marker (no account, amount = 0)
router.post('/reconciliation', (req, res) => {
    try {
        const { date } = req.body;

        // Only date is required
        if (!date) {
            return res.status(400).json({
                error: 'Date is required for reconciliation'
            });
        }

        const result = db.prepare(`
            INSERT INTO transactions (date, amount, account_id, category_id, memo, status, type, is_reconciliation_point)
            VALUES (?, 0, NULL, NULL, NULL, 'settled', 'regular', 1)
        `).run(date);

        const transaction = db.prepare(`
            SELECT 
                t.*,
                a.name as account_name,
                a.icon as account_icon,
                a.type as account_type,
                c.name as category_name,
                c.icon as category_icon
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.id = ?
        `).get(result.lastInsertRowid);

        res.status(201).json(transaction);
    } catch (error) {
        console.error('Error creating reconciliation:', error);
        res.status(500).json({ error: 'Failed to create reconciliation' });
    }
});

// ==================== POST /api/transactions/account-transfer ====================
// Create paired account transfer (outflow from one account, inflow to another)
router.post('/account-transfer', (req, res) => {
    try {
        const {
            date,
            amount,
            from_account_id,
            to_account_id,
            memo,
            status = 'settled'
        } = req.body;

        // Validation
        if (!date || !amount || !from_account_id || !to_account_id) {
            return res.status(400).json({
                error: 'Date, amount, from_account_id, and to_account_id are required'
            });
        }

        if (amount <= 0) {
            return res.status(400).json({ error: 'Amount must be positive' });
        }

        if (from_account_id === to_account_id) {
            return res.status(400).json({ error: 'Cannot transfer to the same account' });
        }

        // Verify both accounts exist
        const fromAccount = db.prepare('SELECT id FROM accounts WHERE id = ?').get(from_account_id);
        const toAccount = db.prepare('SELECT id FROM accounts WHERE id = ?').get(to_account_id);

        if (!fromAccount || !toAccount) {
            return res.status(400).json({ error: 'One or both accounts not found' });
        }

        // Create both transactions in a single database transaction
        const insertStmt = db.prepare(`
            INSERT INTO transactions (date, amount, account_id, memo, status, type)
            VALUES (?, ?, ?, ?, ?, 'account_transfer')
        `);

        const updatePairStmt = db.prepare(`
            UPDATE transactions SET transfer_pair_id = ? WHERE id = ?
        `);

        const dbTransaction = db.transaction(() => {
            // Create outflow (negative amount)
            const outflowResult = insertStmt.run(date, -Math.abs(amount), from_account_id, memo || null, status);
            const outflowId = outflowResult.lastInsertRowid;

            // Create inflow (positive amount)
            const inflowResult = insertStmt.run(date, Math.abs(amount), to_account_id, memo || null, status);
            const inflowId = inflowResult.lastInsertRowid;

            // Link them together
            updatePairStmt.run(inflowId, outflowId);
            updatePairStmt.run(outflowId, inflowId);

            return { outflowId, inflowId };
        });

        const { outflowId, inflowId } = dbTransaction();

        // Fetch both transactions with full details
        const selectQuery = `
            SELECT 
                t.*,
                a.name as account_name,
                a.icon as account_icon,
                a.type as account_type
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            WHERE t.id = ?
        `;

        const outflow = db.prepare(selectQuery).get(outflowId);
        const inflow = db.prepare(selectQuery).get(inflowId);

        res.status(201).json({ outflow, inflow });
    } catch (error) {
        console.error('Error creating account transfer:', error);
        res.status(500).json({ error: 'Failed to create account transfer' });
    }
});

// ==================== PATCH /api/transactions/:id ====================
// Update transaction
router.patch('/:id', (req, res) => {
    try {
        const id = req.params.id;
        const { date, amount, account_id, category_id, memo, status } = req.body;

        // Check if transaction exists
        const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Build dynamic update
        const updates = [];
        const values = [];

        if (date !== undefined) {
            updates.push('date = ?');
            values.push(date);
        }

        if (amount !== undefined) {
            updates.push('amount = ?');
            values.push(amount);
        }

        if (account_id !== undefined) {
            // Verify account exists
            const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get(account_id);
            if (!account) {
                return res.status(400).json({ error: 'Account not found' });
            }
            updates.push('account_id = ?');
            values.push(account_id);
        }

        if (category_id !== undefined) {
            if (category_id === null) {
                updates.push('category_id = NULL');
            } else {
                // Verify category exists
                const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id);
                if (!category) {
                    return res.status(400).json({ error: 'Category not found' });
                }
                updates.push('category_id = ?');
                values.push(category_id);
            }
        }

        if (memo !== undefined) {
            updates.push('memo = ?');
            values.push(memo || null);
        }

        if (status !== undefined) {
            if (!['settled', 'pending'].includes(status)) {
                return res.status(400).json({ error: 'Status must be settled or pending' });
            }
            updates.push('status = ?');
            values.push(status);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        db.prepare(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        const transaction = db.prepare(`
            SELECT 
                t.*,
                a.name as account_name,
                a.icon as account_icon,
                a.type as account_type,
                c.name as category_name,
                c.icon as category_icon
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.id = ?
        `).get(id);

        res.json(transaction);
    } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(500).json({ error: 'Failed to update transaction' });
    }
});

// ==================== PATCH /api/transactions/:id/toggle-reconciliation ====================
// Toggle reconciliation point
router.patch('/:id/toggle-reconciliation', (req, res) => {
    try {
        const id = req.params.id;

        const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        const newValue = existing.is_reconciliation_point ? 0 : 1;

        db.prepare(`
            UPDATE transactions 
            SET is_reconciliation_point = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).run(newValue, id);

        const transaction = db.prepare(`
            SELECT 
                t.*,
                a.name as account_name,
                a.icon as account_icon,
                a.type as account_type,
                c.name as category_name,
                c.icon as category_icon
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.id = ?
        `).get(id);

        res.json(transaction);
    } catch (error) {
        console.error('Error toggling reconciliation:', error);
        res.status(500).json({ error: 'Failed to toggle reconciliation' });
    }
});

// ==================== PATCH /api/transactions/:id/toggle-status ====================
// Toggle between pending and settled
router.patch('/:id/toggle-status', (req, res) => {
    try {
        const id = req.params.id;

        const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        const newStatus = existing.status === 'pending' ? 'settled' : 'pending';

        // When settling, set date to today if not set
        // When making pending, clear the date
        let dateUpdate = '';
        const values = [];

        if (newStatus === 'settled' && !existing.date) {
            dateUpdate = ', date = ?';
            values.push(new Date().toISOString().split('T')[0]);
        } else if (newStatus === 'pending') {
            dateUpdate = ', date = NULL';
        }

        values.push(newStatus, id);

        db.prepare(`
            UPDATE transactions 
            SET status = ?${dateUpdate}, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).run(...[newStatus, ...(dateUpdate.includes('date = ?') ? [values[0]] : []), id]);

        const transaction = db.prepare(`
            SELECT 
                t.*,
                a.name as account_name,
                a.icon as account_icon,
                a.type as account_type,
                c.name as category_name,
                c.icon as category_icon
            FROM transactions t
            LEFT JOIN accounts a ON t.account_id = a.id
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.id = ?
        `).get(id);

        res.json(transaction);
    } catch (error) {
        console.error('Error toggling status:', error);
        res.status(500).json({ error: 'Failed to toggle status' });
    }
});

// ==================== DELETE /api/transactions/:id ====================
// Delete transaction
router.delete('/:id', (req, res) => {
    try {
        const id = req.params.id;

        const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // If this is part of an account transfer, delete both
        if (existing.transfer_pair_id) {
            db.prepare('DELETE FROM transactions WHERE id = ? OR id = ?').run(id, existing.transfer_pair_id);
            res.json({ message: 'Account transfer deleted successfully', deletedPair: true });
        } else {
            db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
            res.json({ message: 'Transaction deleted successfully' });
        }
    } catch (error) {
        console.error('Error deleting transaction:', error);
        res.status(500).json({ error: 'Failed to delete transaction' });
    }
});

export default router;
