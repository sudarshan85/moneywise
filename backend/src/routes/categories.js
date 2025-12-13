import express from 'express';
import db from '../db/database.js';

const router = express.Router();

// ==================== CATEGORY GROUPS ====================

// GET /api/categories/groups - Get all category groups
router.get('/groups', (req, res) => {
    try {
        const groups = db.prepare('SELECT * FROM category_groups ORDER BY sort_order, name').all();
        res.json(groups);
    } catch (error) {
        console.error('Error fetching category groups:', error);
        res.status(500).json({ error: 'Failed to fetch category groups' });
    }
});

// POST /api/categories/groups - Create new category group
router.post('/groups', (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const result = db.prepare(`
            INSERT INTO category_groups (name, sort_order)
            VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM category_groups))
        `).run(name);

        const group = db.prepare('SELECT * FROM category_groups WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(group);
    } catch (error) {
        console.error('Error creating category group:', error);
        res.status(500).json({ error: 'Failed to create category group' });
    }
});

// PATCH /api/categories/groups/:id - Update category group
router.patch('/groups/:id', (req, res) => {
    try {
        const { name, sort_order } = req.body;
        const id = req.params.id;

        const existing = db.prepare('SELECT * FROM category_groups WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Category group not found' });
        }

        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
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

        db.prepare(`UPDATE category_groups SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        const group = db.prepare('SELECT * FROM category_groups WHERE id = ?').get(id);
        res.json(group);
    } catch (error) {
        console.error('Error updating category group:', error);
        res.status(500).json({ error: 'Failed to update category group' });
    }
});

// DELETE /api/categories/groups/:id - Delete category group (only if empty)
router.delete('/groups/:id', (req, res) => {
    try {
        const id = req.params.id;

        const existing = db.prepare('SELECT * FROM category_groups WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Category group not found' });
        }

        const hasCategories = db.prepare('SELECT COUNT(*) as count FROM categories WHERE group_id = ?').get(id);
        if (hasCategories.count > 0) {
            return res.status(400).json({
                error: 'Cannot delete group with categories. Move or delete categories first.',
                categoryCount: hasCategories.count
            });
        }

        db.prepare('DELETE FROM category_groups WHERE id = ?').run(id);
        res.json({ message: 'Category group deleted successfully' });
    } catch (error) {
        console.error('Error deleting category group:', error);
        res.status(500).json({ error: 'Failed to delete category group' });
    }
});

// ==================== CATEGORIES ====================

// GET /api/categories - Get all categories (with optional group info)
router.get('/', (req, res) => {
    try {
        const includeHidden = req.query.includeHidden === 'true';
        const groupId = req.query.groupId;

        let query = `
            SELECT c.*, cg.name as group_name
            FROM categories c
            LEFT JOIN category_groups cg ON c.group_id = cg.id
            WHERE 1=1
        `;
        const params = [];

        if (!includeHidden) {
            query += ' AND c.is_hidden = 0';
        }
        if (groupId) {
            query += ' AND c.group_id = ?';
            params.push(groupId);
        }

        query += ' ORDER BY cg.sort_order, c.sort_order, c.name';

        const categories = db.prepare(query).all(...params);
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// GET /api/categories/:id - Get single category with rename history
router.get('/:id', (req, res) => {
    try {
        const category = db.prepare(`
            SELECT c.*, cg.name as group_name
            FROM categories c
            LEFT JOIN category_groups cg ON c.group_id = cg.id
            WHERE c.id = ?
        `).get(req.params.id);

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
        const { name, group_id, type, monthly_amount } = req.body;

        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }

        if (!['reportable', 'non_reportable', 'credit_card'].includes(type)) {
            return res.status(400).json({ error: 'Type must be "reportable", "non_reportable", or "credit_card"' });
        }

        // Verify group exists if provided
        if (group_id) {
            const group = db.prepare('SELECT id FROM category_groups WHERE id = ?').get(group_id);
            if (!group) {
                return res.status(400).json({ error: 'Category group not found' });
            }
        }

        const result = db.prepare(`
            INSERT INTO categories (name, group_id, type, monthly_amount, sort_order)
            VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories WHERE group_id IS ?))
        `).run(name, group_id || null, type, monthly_amount || 0, group_id || null);

        const category = db.prepare(`
            SELECT c.*, cg.name as group_name
            FROM categories c
            LEFT JOIN category_groups cg ON c.group_id = cg.id
            WHERE c.id = ?
        `).get(result.lastInsertRowid);

        res.status(201).json(category);
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ error: 'Failed to create category' });
    }
});

// PATCH /api/categories/:id - Update category (tracks renames)
router.patch('/:id', (req, res) => {
    try {
        const { name, group_id, type, monthly_amount, is_hidden, sort_order } = req.body;
        const id = req.params.id;

        const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Category not found' });
        }

        // Track rename if name is changing
        if (name !== undefined && name !== existing.name) {
            db.prepare(`
                INSERT INTO category_rename_history (category_id, old_name, new_name)
                VALUES (?, ?, ?)
            `).run(id, existing.name, name);
        }

        const updates = [];
        const values = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(name);
        }
        if (group_id !== undefined) {
            // Verify group exists if not null
            if (group_id !== null) {
                const group = db.prepare('SELECT id FROM category_groups WHERE id = ?').get(group_id);
                if (!group) {
                    return res.status(400).json({ error: 'Category group not found' });
                }
            }
            updates.push('group_id = ?');
            values.push(group_id);
        }
        if (type !== undefined) {
            if (!['reportable', 'non_reportable', 'credit_card'].includes(type)) {
                return res.status(400).json({ error: 'Type must be "reportable", "non_reportable", or "credit_card"' });
            }
            updates.push('type = ?');
            values.push(type);
        }
        if (monthly_amount !== undefined) {
            updates.push('monthly_amount = ?');
            values.push(monthly_amount);
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

        db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);

        const category = db.prepare(`
            SELECT c.*, cg.name as group_name
            FROM categories c
            LEFT JOIN category_groups cg ON c.group_id = cg.id
            WHERE c.id = ?
        `).get(id);

        res.json(category);
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

// DELETE /api/categories/:id - Delete category (only if no transactions)
router.delete('/:id', (req, res) => {
    try {
        const id = req.params.id;

        const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
        if (!existing) {
            return res.status(404).json({ error: 'Category not found' });
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

        // Delete rename history first (cascade should handle this, but being explicit)
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
