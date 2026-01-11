import express from 'express';
import db from '../db/database.js';

const router = express.Router();

// GET /api/transfers - List category transfers
router.get('/', (req, res) => {
    try {
        const { startDate, endDate, category_id, limit = 100, offset = 0 } = req.query;

        let query = `
            SELECT 
                ct.*,
                fc.name as from_category_name,
                fc.icon as from_category_icon,
                tc.name as to_category_name,
                tc.icon as to_category_icon
            FROM category_transfers ct
            LEFT JOIN categories fc ON ct.from_category_id = fc.id
            LEFT JOIN categories tc ON ct.to_category_id = tc.id
            WHERE 1=1
        `;
        const params = [];

        if (startDate) {
            query += ' AND ct.date >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += ' AND ct.date <= ?';
            params.push(endDate);
        }

        if (category_id) {
            query += ' AND (ct.from_category_id = ? OR ct.to_category_id = ?)';
            params.push(category_id, category_id);
        }

        query += ' ORDER BY ct.date DESC, ct.created_at DESC';
        query += ' LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const transfers = db.prepare(query).all(...params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM category_transfers ct WHERE 1=1';
        const countParams = [];

        if (startDate) {
            countQuery += ' AND ct.date >= ?';
            countParams.push(startDate);
        }
        if (endDate) {
            countQuery += ' AND ct.date <= ?';
            countParams.push(endDate);
        }
        if (category_id) {
            countQuery += ' AND (ct.from_category_id = ? OR ct.to_category_id = ?)';
            countParams.push(category_id, category_id);
        }

        const { total } = db.prepare(countQuery).get(...countParams);

        res.json({ transfers, total, limit: parseInt(limit), offset: parseInt(offset) });
    } catch (error) {
        console.error('Error fetching transfers:', error);
        res.status(500).json({ error: 'Failed to fetch transfers' });
    }
});

// POST /api/transfers - Create category transfer
router.post('/', (req, res) => {
    try {
        const { date, from_category_id, to_category_id, amount, memo } = req.body;

        // Validation
        if (!date || !amount) {
            return res.status(400).json({ error: 'Date and amount are required' });
        }

        if (amount <= 0) {
            return res.status(400).json({ error: 'Amount must be positive' });
        }

        // from_category_id can be null (from MoneyPot)
        // to_category_id can be null (to MoneyPot)
        if (!from_category_id && !to_category_id) {
            return res.status(400).json({ error: 'At least one category must be specified' });
        }

        if (from_category_id === to_category_id) {
            return res.status(400).json({ error: 'Cannot transfer to the same category' });
        }

        // Verify categories exist if specified
        if (from_category_id) {
            const fromCat = db.prepare('SELECT id FROM categories WHERE id = ?').get(from_category_id);
            if (!fromCat) {
                return res.status(400).json({ error: 'From category not found' });
            }
        }

        if (to_category_id) {
            const toCat = db.prepare('SELECT id FROM categories WHERE id = ?').get(to_category_id);
            if (!toCat) {
                return res.status(400).json({ error: 'To category not found' });
            }
        }

        const result = db.prepare(`
            INSERT INTO category_transfers (date, from_category_id, to_category_id, amount, memo)
            VALUES (?, ?, ?, ?, ?)
        `).run(date, from_category_id || null, to_category_id || null, amount, memo || null);

        // Fetch the created transfer with category details
        const transfer = db.prepare(`
            SELECT 
                ct.*,
                fc.name as from_category_name,
                fc.icon as from_category_icon,
                tc.name as to_category_name,
                tc.icon as to_category_icon
            FROM category_transfers ct
            LEFT JOIN categories fc ON ct.from_category_id = fc.id
            LEFT JOIN categories tc ON ct.to_category_id = tc.id
            WHERE ct.id = ?
        `).get(result.lastInsertRowid);

        res.status(201).json(transfer);
    } catch (error) {
        console.error('Error creating transfer:', error);
        res.status(500).json({ error: 'Failed to create transfer' });
    }
});

// GET /api/transfers/:id - Get single transfer
router.get('/:id', (req, res) => {
    try {
        const transfer = db.prepare(`
            SELECT 
                ct.*,
                fc.name as from_category_name,
                fc.icon as from_category_icon,
                tc.name as to_category_name,
                tc.icon as to_category_icon
            FROM category_transfers ct
            LEFT JOIN categories fc ON ct.from_category_id = fc.id
            LEFT JOIN categories tc ON ct.to_category_id = tc.id
            WHERE ct.id = ?
        `).get(req.params.id);

        if (!transfer) {
            return res.status(404).json({ error: 'Transfer not found' });
        }

        res.json(transfer);
    } catch (error) {
        console.error('Error fetching transfer:', error);
        res.status(500).json({ error: 'Failed to fetch transfer' });
    }
});

// DELETE /api/transfers/:id - Delete transfer
router.delete('/:id', (req, res) => {
    try {
        const existing = db.prepare('SELECT id FROM category_transfers WHERE id = ?').get(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: 'Transfer not found' });
        }

        db.prepare('DELETE FROM category_transfers WHERE id = ?').run(req.params.id);
        res.json({ message: 'Transfer deleted successfully' });
    } catch (error) {
        console.error('Error deleting transfer:', error);
        res.status(500).json({ error: 'Failed to delete transfer' });
    }
});

// PATCH /api/transfers/:id - Update transfer
router.patch('/:id', (req, res) => {
    try {
        const { date, from_category_id, to_category_id, amount, memo } = req.body;
        const id = req.params.id;

        const existing = db.prepare('SELECT id FROM category_transfers WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Transfer not found' });
        }

        // Build dynamic update
        const updates = [];
        const values = [];

        if (date !== undefined) {
            updates.push('date = ?');
            values.push(date);
        }
        if (from_category_id !== undefined) {
            updates.push('from_category_id = ?');
            values.push(from_category_id);
        }
        if (to_category_id !== undefined) {
            updates.push('to_category_id = ?');
            values.push(to_category_id);
        }
        if (amount !== undefined) {
            updates.push('amount = ?');
            values.push(amount);
        }
        if (memo !== undefined) {
            updates.push('memo = ?');
            values.push(memo);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        db.prepare(`UPDATE category_transfers SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        // Fetch updated transfer
        const transfer = db.prepare(`
            SELECT 
                ct.*,
                fc.name as from_category_name,
                fc.icon as from_category_icon,
                tc.name as to_category_name,
                tc.icon as to_category_icon
            FROM category_transfers ct
            LEFT JOIN categories fc ON ct.from_category_id = fc.id
            LEFT JOIN categories tc ON ct.to_category_id = tc.id
            WHERE ct.id = ?
        `).get(id);

        res.json(transfer);
    } catch (error) {
        console.error('Error updating transfer:', error);
        res.status(500).json({ error: 'Failed to update transfer' });
    }
});

// POST /api/transfers/auto-populate - Create transfers for all budgeted categories
// For each category with monthly_amount > 0:
//   - Calculate current balance (transfers_in - spending)
//   - Create transfer for (monthly_amount - current_balance) if positive
router.post('/auto-populate', (req, res) => {
    try {
        // Use provided date or default to today
        const transferDate = req.body?.date || new Date().toISOString().split('T')[0];

        // Get "Available to Budget" category ID
        const atbCategory = db.prepare(`
            SELECT id FROM categories WHERE name = 'Available to Budget' AND is_system = 1
        `).get();

        if (!atbCategory) {
            return res.status(500).json({ error: 'Available to Budget category not found' });
        }

        // Get all user categories with monthly_amount > 0
        const budgetedCategories = db.prepare(`
            SELECT id, name, monthly_amount
            FROM categories
            WHERE is_system = 0 AND is_hidden = 0 AND monthly_amount > 0
        `).all();

        const createdTransfers = [];
        const skippedCategories = [];

        for (const category of budgetedCategories) {
            // Calculate current category balance
            // Transfers IN from ATB
            const transfersIn = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM category_transfers
                WHERE to_category_id = ?
            `).get(category.id).total;

            // Transfers OUT (returned to ATB or to other categories)
            const transfersOut = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM category_transfers
                WHERE from_category_id = ?
            `).get(category.id).total;

            // Spending in this category (negative = outflow)
            const spending = db.prepare(`
                SELECT COALESCE(SUM(amount), 0) as total
                FROM transactions
                WHERE category_id = ? AND status = 'settled'
            `).get(category.id).total;

            // Current balance = transfers_in - transfers_out + spending (spending is negative)
            const currentBalance = transfersIn - transfersOut + spending;

            // How much do we need to reach monthly_amount?
            const neededAmount = category.monthly_amount - currentBalance;

            if (neededAmount > 0) {
                // Create transfer from ATB to this category
                const result = db.prepare(`
                    INSERT INTO category_transfers (date, from_category_id, to_category_id, amount, memo)
                    VALUES (?, ?, ?, ?, ?)
                `).run(transferDate, atbCategory.id, category.id, neededAmount, `Monthly budget for ${category.name}`);

                createdTransfers.push({
                    id: result.lastInsertRowid,
                    category_name: category.name,
                    amount: neededAmount,
                    monthly_amount: category.monthly_amount,
                    previous_balance: currentBalance
                });
            } else {
                skippedCategories.push({
                    category_name: category.name,
                    monthly_amount: category.monthly_amount,
                    current_balance: currentBalance,
                    reason: currentBalance >= category.monthly_amount ? 'Already funded' : 'Overfunded'
                });
            }
        }

        res.status(201).json({
            created: createdTransfers,
            skipped: skippedCategories,
            total_transferred: createdTransfers.reduce((sum, t) => sum + t.amount, 0)
        });
    } catch (error) {
        console.error('Error auto-populating transfers:', error);
        res.status(500).json({ error: 'Failed to auto-populate transfers' });
    }
});

export default router;
