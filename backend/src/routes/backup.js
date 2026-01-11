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

// POST /api/backup/import - Import full backup including transactions
router.post('/import', (req, res) => {
    // Support both old format (direct keys) and new format (nested in data)
    const accountsData = req.body.accounts || req.body.data?.accounts;
    const categoriesData = req.body.categories || req.body.data?.categories;
    const transactionsData = req.body.transactions || req.body.data?.transactions;
    const categoryTransfersData = req.body.categoryTransfers || req.body.data?.categoryTransfers;

    if (!accountsData && !categoriesData && !transactionsData) {
        return res.status(400).json({ error: 'No data to import' });
    }

    try {
        const results = {
            accountsImported: 0,
            categoriesImported: 0,
            transactionsImported: 0,
            transfersImported: 0,
            errors: []
        };

        // Maps to track old ID -> new ID relationships
        const accountNameToId = {};
        const categoryNameToId = {};

        // First, build maps of existing accounts and categories by name
        const existingAccounts = db.prepare('SELECT id, name FROM accounts').all();
        for (const acc of existingAccounts) {
            accountNameToId[acc.name] = acc.id;
        }

        const existingCategories = db.prepare('SELECT id, name FROM categories').all();
        for (const cat of existingCategories) {
            categoryNameToId[cat.name] = cat.id;
        }

        // Import accounts
        const insertAccount = db.prepare(`
            INSERT OR IGNORE INTO accounts (name, type, icon, is_hidden, in_moneypot, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

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
                        acc.in_moneypot || 0,
                        acc.sort_order || accSort++
                    );
                    if (result.changes > 0) {
                        results.accountsImported++;
                        // Get the new ID for this account
                        const newAcc = db.prepare('SELECT id FROM accounts WHERE name = ?').get(acc.name);
                        if (newAcc) accountNameToId[acc.name] = newAcc.id;
                    }
                } catch (e) {
                    results.errors.push(`Account ${acc.name}: ${e.message}`);
                }
            }
        }

        // Import categories (skip system categories)
        const insertCategory = db.prepare(`
            INSERT OR IGNORE INTO categories (name, icon, monthly_amount, is_system, is_hidden, sort_order)
            VALUES (?, ?, ?, 0, ?, ?)
        `);

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
                    if (result.changes > 0) {
                        results.categoriesImported++;
                        const newCat = db.prepare('SELECT id FROM categories WHERE name = ?').get(cat.name);
                        if (newCat) categoryNameToId[cat.name] = newCat.id;
                    }
                } catch (e) {
                    results.errors.push(`Category ${cat.name}: ${e.message}`);
                }
            }
        }

        // Import transactions
        const insertTransaction = db.prepare(`
            INSERT INTO transactions (date, amount, account_id, category_id, memo, status, type, transfer_pair_id, is_reconciliation_point, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Build old account/category ID to name maps for transaction lookup
        const oldAccIdToName = {};
        const oldCatIdToName = {};

        if (accountsData?.length) {
            for (const acc of accountsData) {
                oldAccIdToName[acc.id] = acc.name;
            }
        }
        if (categoriesData?.length) {
            for (const cat of categoriesData) {
                oldCatIdToName[cat.id] = cat.name;
            }
        }

        if (transactionsData?.length) {
            for (const txn of transactionsData) {
                try {
                    // Map old account_id to new account_id via name
                    const accountName = oldAccIdToName[txn.account_id];
                    const newAccountId = accountName ? accountNameToId[accountName] : null;

                    if (!newAccountId) {
                        results.errors.push(`Transaction: Account not found for ID ${txn.account_id}`);
                        continue;
                    }

                    // Map old category_id to new category_id via name
                    let newCategoryId = null;
                    if (txn.category_id) {
                        const categoryName = oldCatIdToName[txn.category_id];
                        newCategoryId = categoryName ? categoryNameToId[categoryName] : null;
                    }

                    insertTransaction.run(
                        txn.date,
                        txn.amount,
                        newAccountId,
                        newCategoryId,
                        txn.memo,
                        txn.status || 'settled',
                        txn.type || 'regular',
                        null, // transfer_pair_id - don't preserve as IDs change
                        txn.is_reconciliation_point || 0,
                        txn.created_at || new Date().toISOString(),
                        txn.updated_at || new Date().toISOString()
                    );
                    results.transactionsImported++;
                } catch (e) {
                    results.errors.push(`Transaction: ${e.message}`);
                }
            }
        }

        // Import category transfers
        const insertTransfer = db.prepare(`
            INSERT INTO category_transfers (date, from_category_id, to_category_id, amount, memo, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        if (categoryTransfersData?.length) {
            for (const transfer of categoryTransfersData) {
                try {
                    // Map old category IDs to new ones
                    const fromCatName = oldCatIdToName[transfer.from_category_id];
                    const toCatName = oldCatIdToName[transfer.to_category_id];

                    const newFromId = fromCatName ? categoryNameToId[fromCatName] : null;
                    const newToId = toCatName ? categoryNameToId[toCatName] : null;

                    if (!newFromId && !newToId) {
                        results.errors.push(`Transfer: Both categories not found`);
                        continue;
                    }

                    insertTransfer.run(
                        transfer.date,
                        newFromId,
                        newToId,
                        transfer.amount,
                        transfer.memo,
                        transfer.created_at || new Date().toISOString(),
                        transfer.updated_at || new Date().toISOString()
                    );
                    results.transfersImported++;
                } catch (e) {
                    results.errors.push(`Transfer: ${e.message}`);
                }
            }
        }

        // Import app settings (including monthly_income)
        const appSettingsData = req.body.appSettings || req.body.data?.appSettings;
        if (appSettingsData?.length) {
            const upsertSetting = db.prepare(`
                INSERT INTO app_settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `);

            for (const setting of appSettingsData) {
                try {
                    upsertSetting.run(setting.key, setting.value);
                    results.settingsImported = (results.settingsImported || 0) + 1;
                } catch (e) {
                    results.errors.push(`Setting ${setting.key}: ${e.message}`);
                }
            }
        }

        const summary = [
            results.accountsImported > 0 ? `${results.accountsImported} accounts` : null,
            results.categoriesImported > 0 ? `${results.categoriesImported} categories` : null,
            results.transactionsImported > 0 ? `${results.transactionsImported} transactions` : null,
            results.transfersImported > 0 ? `${results.transfersImported} transfers` : null,
            results.settingsImported > 0 ? `${results.settingsImported} settings` : null
        ].filter(Boolean).join(', ');

        res.json({
            success: true,
            message: `Imported: ${summary || 'nothing new'}`,
            ...results
        });
    } catch (error) {
        res.status(500).json({ error: 'Import failed', details: error.message });
    }
});

export default router;
