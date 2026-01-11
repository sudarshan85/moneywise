import express from 'express';
import db, { getDatabasePath } from '../db/database.js';

const router = express.Router();

// ==================== SETTINGS ====================

// GET /api/categories/settings - Get app settings
router.get('/settings', (req, res) => {
    try {
        const settings = db.prepare('SELECT key, value FROM app_settings').all();
        const settingsObj = settings.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {});

        // Add database path (read-only)
        settingsObj.database_path = getDatabasePath();

        res.json(settingsObj);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// PUT /api/categories/settings - Update app settings
router.put('/settings', (req, res) => {
    try {
        const updates = req.body;

        const upsertStmt = db.prepare(`
            INSERT INTO app_settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
        `);

        for (const [key, value] of Object.entries(updates)) {
            // Don't allow updating database_path through API
            if (key === 'database_path') continue;
            upsertStmt.run(key, value, value);
        }

        // Return updated settings
        const settings = db.prepare('SELECT key, value FROM app_settings').all();
        const settingsObj = settings.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {});
        settingsObj.database_path = getDatabasePath();

        res.json(settingsObj);
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ==================== CATEGORIES ====================

// GET /api/categories/balances - Get all category balances with budget info
// Balance = monthly_amount + transfers_in - transfers_out - spending
router.get('/balances', (req, res) => {
    try {
        // Get all non-system categories with their balances
        const categories = db.prepare(`
            SELECT 
                c.id,
                c.name,
                c.icon,
                c.monthly_amount,
                c.is_hidden,
                COALESCE(SUM(CASE WHEN t.status = 'settled' THEN t.amount ELSE 0 END), 0) as spending,
                COALESCE((
                    SELECT SUM(amount) FROM category_transfers WHERE to_category_id = c.id
                ), 0) as transfers_in,
                COALESCE((
                    SELECT SUM(amount) FROM category_transfers WHERE from_category_id = c.id
                ), 0) as transfers_out
            FROM categories c
            LEFT JOIN transactions t ON t.category_id = c.id
            WHERE c.is_system = 0
            GROUP BY c.id
            ORDER BY c.sort_order, c.name
        `).all();

        // Calculate balance for each category
        const balances = categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            icon: cat.icon,
            monthly_amount: cat.monthly_amount,
            is_hidden: cat.is_hidden,
            spending: Math.abs(cat.spending), // Make spending positive for display
            transfers_in: cat.transfers_in,
            transfers_out: cat.transfers_out,
            balance: cat.monthly_amount + cat.transfers_in - cat.transfers_out + cat.spending // spending is negative
        }));

        res.json(balances);
    } catch (error) {
        console.error('Error fetching category balances:', error);
        res.status(500).json({ error: 'Failed to fetch category balances' });
    }
});

// GET /api/categories - Get all categories
router.get('/', (req, res) => {
    try {
        const includeHidden = req.query.includeHidden === 'true';

        let query = 'SELECT * FROM categories WHERE 1=1';

        if (!includeHidden) {
            query += ' AND is_hidden = 0';
        }

        query += ' ORDER BY is_system DESC, sort_order, name';

        const categories = db.prepare(query).all();
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// GET /api/categories/:id - Get single category with rename history
router.get('/:id', (req, res) => {
    try {
        const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);

        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Get rename history
        const renameHistory = db.prepare(`
            SELECT old_name, new_name, changed_at
            FROM category_rename_history
            WHERE category_id = ?
            ORDER BY changed_at DESC
        `).all(req.params.id);

        res.json({ ...category, rename_history: renameHistory });
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).json({ error: 'Failed to fetch category' });
    }
});

// POST /api/categories - Create new category
router.post('/', (req, res) => {
    try {
        const { name, icon, monthly_amount } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const result = db.prepare(`
            INSERT INTO categories (name, icon, monthly_amount, sort_order)
            VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories WHERE is_system = 0))
        `).run(name, icon || null, monthly_amount || 0);

        const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(category);
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ error: 'Failed to create category' });
    }
});

// PATCH /api/categories/:id - Update category (tracks renames)
router.patch('/:id', (req, res) => {
    try {
        const { name, icon, monthly_amount, is_hidden, sort_order } = req.body;
        const id = req.params.id;

        const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Prevent editing system category names
        if (existing.is_system && name !== undefined && name !== existing.name) {
            return res.status(400).json({ error: 'Cannot rename system categories' });
        }

        // Track rename if name is changing (only for non-system categories)
        if (name !== undefined && name !== existing.name && !existing.is_system) {
            db.prepare(`
                INSERT INTO category_rename_history (category_id, old_name, new_name)
                VALUES (?, ?, ?)
            `).run(id, existing.name, name);
        }

        const updates = [];
        const values = [];

        if (name !== undefined && !existing.is_system) {
            updates.push('name = ?');
            values.push(name);
        }
        if (icon !== undefined) {
            updates.push('icon = ?');
            values.push(icon || null);
        }
        if (monthly_amount !== undefined) {
            updates.push('monthly_amount = ?');
            values.push(monthly_amount);
        }
        if (is_hidden !== undefined && !existing.is_system) {
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

        db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
        res.json(category);
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

// DELETE /api/categories/:id - Delete category (only if no transactions and not system)
router.delete('/:id', (req, res) => {
    try {
        const id = req.params.id;

        const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Prevent deleting system categories
        if (existing.is_system) {
            return res.status(400).json({ error: 'Cannot delete system categories' });
        }

        // Check for transactions
        const hasTransactions = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE category_id = ?').get(id);
        if (hasTransactions.count > 0) {
            return res.status(400).json({
                error: 'Cannot delete category with transactions. Hide it instead.',
                transactionCount: hasTransactions.count
            });
        }

        // Check for category transfers
        const hasTransfers = db.prepare(`
            SELECT COUNT(*) as count FROM category_transfers 
            WHERE from_category_id = ? OR to_category_id = ?
        `).get(id, id);
        if (hasTransfers.count > 0) {
            return res.status(400).json({
                error: 'Cannot delete category with transfers. Hide it instead.',
                transferCount: hasTransfers.count
            });
        }

        // Delete rename history first
        db.prepare('DELETE FROM category_rename_history WHERE category_id = ?').run(id);
        db.prepare('DELETE FROM categories WHERE id = ?').run(id);

        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

// GET /api/categories/:id/history - Get rename history for a category
router.get('/:id/history', (req, res) => {
    try {
        const history = db.prepare(`
            SELECT old_name, new_name, changed_at
            FROM category_rename_history
            WHERE category_id = ?
            ORDER BY changed_at DESC
        `).all(req.params.id);

        res.json(history);
    } catch (error) {
        console.error('Error fetching category history:', error);
        res.status(500).json({ error: 'Failed to fetch category history' });
    }
});

export default router;
