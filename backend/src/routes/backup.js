import express from 'express';
import fs from 'fs';
import path from 'path';
import db from '../db/database.js';

const router = express.Router();

// Backup configuration
const BACKUP_DIR = '/mnt/s/Finance Data';

// Ensure backup directory exists
try {
    if (fs.existsSync(path.dirname(BACKUP_DIR)) && !fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
} catch (error) {
    console.error('Failed to create backup directory:', error);
}

// Helper: Get full dataset for backup
export function getBackupData() {
    const accounts = db.prepare(`
        SELECT * FROM accounts ORDER BY sort_order
    `).all();

    const categories = db.prepare(`
        SELECT * FROM categories ORDER BY sort_order
    `).all();

    const transactions = db.prepare(`
        SELECT * FROM transactions ORDER BY date DESC, created_at DESC
    `).all();

    const categoryTransfers = db.prepare(`
        SELECT * FROM category_transfers ORDER BY date DESC
    `).all();

    const appSettings = db.prepare('SELECT * FROM app_settings').all();

    return {
        version: 2,
        exportDate: new Date().toISOString(),
        stats: {
            accounts: accounts.length,
            categories: categories.length,
            transactions: transactions.length
        },
        data: {
            accounts,
            categories,
            transactions,
            categoryTransfers,
            appSettings
        }
    };
}

// Helper: Rotate backups - keep only N most recent
function rotateBackups(maxBackups = 3) {
    try {
        if (!fs.existsSync(BACKUP_DIR)) return;

        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('MoneyWise_Backup_') && f.endsWith('.json'))
            .map(f => ({
                name: f,
                path: path.join(BACKUP_DIR, f),
                stat: fs.statSync(path.join(BACKUP_DIR, f))
            }))
            .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs); // Newest first

        // Delete old backups beyond maxBackups
        if (files.length > maxBackups) {
            const toDelete = files.slice(maxBackups);
            for (const file of toDelete) {
                fs.unlinkSync(file.path);
                console.log(`🗑️ Deleted old backup: ${file.name}`);
            }
        }
    } catch (error) {
        console.error('Backup rotation error:', error.message);
    }
}

// Helper: Write backup to disk
export function performBackup(isManual = false) {
    try {
        if (!fs.existsSync(BACKUP_DIR)) {
            // Try to create it again if it's missing (mount might have come up)
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }

        const data = getBackupData();
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const type = isManual ? 'manual' : 'auto';
        const filename = `MoneyWise_Backup_${type}_${timestamp}.json`;
        const filePath = path.join(BACKUP_DIR, filename);

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`✅ Backup created at: ${filePath}`);

        // Rotate to keep only 3 backups
        rotateBackups(3);

        return { success: true, path: filePath, stats: data.stats };
    } catch (error) {
        console.error('❌ Backup failed:', error.message);
        return { success: false, error: error.message };
    }
}

// GET /api/backup/export - Download full backup
router.get('/export', (req, res) => {
    try {
        const data = getBackupData();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate backup', details: error.message });
    }
});

// POST /api/backup/manual - Trigger manual backup to disk
router.post('/manual', (req, res) => {
    const result = performBackup(true);
    if (result.success) {
        res.json(result);
    } else {
        res.status(500).json(result);
    }
});

// POST /api/backup/import - Import accounts and categories 
// (Legacy support, currently only imports structure, not transactions)
router.post('/import', (req, res) => {
    const { accounts, categories } = req.body;

    // Support both old format (direct keys) and new format (nested in data)
    const accountsData = accounts || req.body.data?.accounts;
    const categoriesData = categories || req.body.data?.categories;

    if (!accountsData && !categoriesData) {
        return res.status(400).json({ error: 'No data to import' });
    }

    try {
        const results = { accountsImported: 0, categoriesImported: 0, errors: [] };

        const insertAccount = db.prepare(`
            INSERT OR IGNORE INTO accounts (name, type, icon, is_hidden, sort_order)
            VALUES (?, ?, ?, ?, ?)
        `);

        const insertCategory = db.prepare(`
            INSERT OR IGNORE INTO categories (name, icon, monthly_amount, is_system, is_hidden, sort_order)
            VALUES (?, ?, ?, 0, ?, ?)
        `);

        // Import items...
        const maxSortAcc = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as max FROM accounts').get().max;
        let accSort = maxSortAcc + 1;

        if (accountsData?.length) {
            for (const acc of accountsData) {
                try {
                    const result = insertAccount.run(
                        acc.name,
                        acc.type || 'bank',
                        acc.icon,
                        acc.is_hidden || 0,
                        acc.sort_order || accSort++
                    );
                    if (result.changes > 0) results.accountsImported++;
                } catch (e) { results.errors.push(`Account ${acc.name}: ${e.message}`); }
            }
        }

        const maxSortCat = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as max FROM categories').get().max;
        let catSort = maxSortCat + 1;

        if (categoriesData?.length) {
            for (const cat of categoriesData) {
                if (cat.is_system) continue;
                try {
                    const result = insertCategory.run(
                        cat.name,
                        cat.icon,
                        cat.monthly_amount || 0,
                        cat.is_hidden || 0,
                        cat.sort_order || catSort++
                    );
                    if (result.changes > 0) results.categoriesImported++;
                } catch (e) { results.errors.push(`Category ${cat.name}: ${e.message}`); }
            }
        }

        res.json({
            success: true,
            message: `Imported structure: ${results.accountsImported} accounts, ${results.categoriesImported} categories. (Transactions import not yet supported)`,
            ...results
        });
    } catch (error) {
        res.status(500).json({ error: 'Import failed', details: error.message });
    }
});

export default router;
