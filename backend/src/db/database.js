import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Database path - local data folder
const defaultDataDir = path.join(__dirname, '../../../data');
const dbPath = process.env.DB_PATH || path.join(defaultDataDir, 'moneywise.db');

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// WAL allows reads during writes; busy_timeout prevents transient SQLITE_BUSY
// errors when backups (VACUUM INTO) overlap with requests.
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// System categories that are auto-created and cannot be deleted
const SYSTEM_CATEGORIES = [
    { name: 'Available to Budget', icon: '/icons/moneypot_on_hand.png', monthly_amount: 0 },
    { name: 'Account Transfer', icon: '/icons/account_transfer.png', monthly_amount: 0 },
    { name: 'Balance Change', icon: '/icons/balance_change.png', monthly_amount: 0 },
];

// Migrate existing system categories to new naming scheme
function migrateSystemCategories() {
    // Remove emoji prefixes and rename categories
    const migrations = [
        { oldName: '💰 MoneyPot', newName: 'Available to Budget', icon: '/icons/moneypot_on_hand.png' },
        { oldName: 'MoneyPot', newName: 'Available to Budget', icon: '/icons/moneypot_on_hand.png' },
        { oldName: '↕️ Account Transfer', newName: 'Account Transfer', icon: '/icons/account_transfer.png' },
        { oldName: '🔢 Balance Adjustment', newName: 'Balance Change', icon: '/icons/balance_change.png' },
    ];

    const updateStmt = db.prepare(`
        UPDATE categories SET name = ?, icon = ? WHERE name = ? AND is_system = 1
    `);

    const deleteStmt = db.prepare(`
        DELETE FROM categories WHERE name = ? AND is_system = 1
    `);

    for (const m of migrations) {
        updateStmt.run(m.newName, m.icon, m.oldName);
    }

    // Delete old "Starting Balance" category
    deleteStmt.run('➡️ Starting Balance');

    // Also fix icons for already-renamed categories (if they have broken icon paths)
    const fixIconsStmt = db.prepare(`
        UPDATE categories SET icon = ? WHERE name = ? AND is_system = 1
    `);
    fixIconsStmt.run('/icons/account_transfer.png', 'Account Transfer');
    fixIconsStmt.run('/icons/balance_change.png', 'Balance Change');
    fixIconsStmt.run('/icons/moneypot_on_hand.png', 'Available to Budget');

    console.log('📝 Migrated system categories to new naming scheme');
}

// Seed system categories if they don't exist
function seedSystemCategories() {
    const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO categories (name, icon, monthly_amount, is_system, sort_order)
        VALUES (?, ?, ?, 1, ?)
    `);

    // Check if any system categories exist
    const existingCount = db.prepare('SELECT COUNT(*) as count FROM categories WHERE is_system = 1').get();

    if (existingCount.count === 0) {
        SYSTEM_CATEGORIES.forEach((cat, index) => {
            insertStmt.run(cat.name, cat.icon, cat.monthly_amount, index);
        });
        console.log('🌱 Seeded system categories');
    } else {
        // Run migration for existing databases
        migrateSystemCategories();
    }
}

// Migrate date column to allow NULL (for pending transactions)
function migrateDateNullable() {
    try {
        // Check if we need to migrate by looking at table info
        const columns = db.prepare("PRAGMA table_info(transactions)").all();
        const dateCol = columns.find(c => c.name === 'date');

        // If date column has notnull = 1, we need to recreate the table
        if (dateCol && dateCol.notnull === 1) {
            console.log('📦 Migrating transactions table to allow null dates...');

            db.exec(`
                -- Create new table with nullable date
                CREATE TABLE transactions_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT,
                    amount REAL NOT NULL,
                    account_id INTEGER NOT NULL,
                    category_id INTEGER,
                    memo TEXT,
                    status TEXT NOT NULL CHECK(status IN ('settled', 'pending')) DEFAULT 'settled',
                    type TEXT NOT NULL CHECK(type IN ('regular', 'account_transfer', 'balance_adjustment', 'starting_balance')) DEFAULT 'regular',
                    transfer_pair_id INTEGER,
                    is_reconciliation_point INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (account_id) REFERENCES accounts(id),
                    FOREIGN KEY (category_id) REFERENCES categories(id),
                    FOREIGN KEY (transfer_pair_id) REFERENCES transactions(id)
                );
                
                -- Copy all data
                INSERT INTO transactions_new SELECT * FROM transactions;
                
                -- Drop old table and rename new
                DROP TABLE transactions;
                ALTER TABLE transactions_new RENAME TO transactions;
                
                -- Recreate indexes
                CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
                CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
                CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
            `);

            console.log('✅ Transactions table migrated successfully');
        }
    } catch (error) {
        console.error('Migration error:', error.message);
    }
}

// Add in_moneypot column to accounts table
function migrateAccountsMoneyPot() {
    try {
        const columns = db.prepare("PRAGMA table_info(accounts)").all();
        const hasColumn = columns.some(c => c.name === 'in_moneypot');

        if (!hasColumn) {
            console.log('📦 Adding in_moneypot column to accounts...');
            db.exec(`ALTER TABLE accounts ADD COLUMN in_moneypot INTEGER DEFAULT 1`);

            // By default, set bank, cash, investment, retirement accounts to be in MoneyPot
            // Credit cards and loans are excluded by default
            db.prepare(`
                UPDATE accounts SET in_moneypot = CASE 
                    WHEN type IN ('bank', 'cash', 'investment', 'retirement') THEN 1 
                    ELSE 0 
                END
            `).run();

            console.log('✅ Added in_moneypot column to accounts');
        }
    } catch (error) {
        console.error('MoneyPot migration error:', error.message);
    }
}

// Indexes serving the hot aggregate queries (dashboard, moneypot, reports)
function migrateIndexes() {
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_category_transfers_from ON category_transfers(from_category_id, date);
        CREATE INDEX IF NOT EXISTS idx_category_transfers_to ON category_transfers(to_category_id, date);
        CREATE INDEX IF NOT EXISTS idx_transactions_cat_status_date ON transactions(category_id, status, date);
        CREATE INDEX IF NOT EXISTS idx_transactions_acct_status ON transactions(account_id, status);
    `);
}

// One-time backfill making in_moneypot the real "on-budget" flag: bank/cash plus
// spend-vehicle credit cards count toward Ready to Assign; investments, retirement
// and loans are off-budget. Keyed via app_settings so manual per-account changes
// made after the backfill are never overwritten on later boots.
function migrateOnBudgetFlag() {
    const done = db.prepare(`SELECT value FROM app_settings WHERE key = 'onbudget_backfill_v1'`).get();
    if (done) return;

    db.transaction(() => {
        db.prepare(`
            UPDATE accounts SET in_moneypot = CASE
                WHEN type IN ('bank', 'cash', 'credit_card') THEN 1
                ELSE 0
            END
        `).run();
        db.prepare(`INSERT INTO app_settings (key, value) VALUES ('onbudget_backfill_v1', '1')`).run();
    })();

    console.log('✅ Backfilled on-budget flag (bank, cash, credit_card)');
}

// One-time: align account sort_order with the display order the dashboard used
// to hardcode client-side (assets first in preferred order, then liabilities).
// After this, ordering is owned by the data and editable via PATCH /accounts.
function migrateAccountSortOrder() {
    const done = db.prepare(`SELECT value FROM app_settings WHERE key = 'account_sort_backfill_v1'`).get();
    if (done) return;

    const preferredOrder = [
        '360 Checking', 'RH Savings', 'RH Investment', 'HSA',
        'RH Roth Savings', 'RH Roth Investment', '401(k)', 'HSA Investment',
        'CO Venture', 'Mortgage', 'Nissan Leaf', "Ambuja's Loan",
    ];

    db.transaction(() => {
        const update = db.prepare('UPDATE accounts SET sort_order = ? WHERE name = ?');
        preferredOrder.forEach((name, index) => update.run(index + 1, name));
        db.prepare(`INSERT INTO app_settings (key, value) VALUES ('account_sort_backfill_v1', '1')`).run();
    })();

    console.log('✅ Backfilled account sort order');
}

// Make account_id nullable for reconciliation transactions
function migrateAccountIdNullable() {
    try {
        const columns = db.prepare("PRAGMA table_info(transactions)").all();
        const accountIdCol = columns.find(c => c.name === 'account_id');

        // If account_id column has notnull = 1, we need to recreate the table
        if (accountIdCol && accountIdCol.notnull === 1) {
            console.log('📦 Migrating transactions table to allow null account_id...');

            db.exec(`
                -- Create new table with nullable account_id
                CREATE TABLE transactions_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT,
                    amount REAL NOT NULL,
                    account_id INTEGER,
                    category_id INTEGER,
                    memo TEXT,
                    status TEXT NOT NULL CHECK(status IN ('settled', 'pending')) DEFAULT 'settled',
                    type TEXT NOT NULL CHECK(type IN ('regular', 'account_transfer', 'balance_adjustment', 'starting_balance')) DEFAULT 'regular',
                    transfer_pair_id INTEGER,
                    is_reconciliation_point INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (account_id) REFERENCES accounts(id),
                    FOREIGN KEY (category_id) REFERENCES categories(id),
                    FOREIGN KEY (transfer_pair_id) REFERENCES transactions(id)
                );
                
                -- Copy all data
                INSERT INTO transactions_new SELECT * FROM transactions;
                
                -- Drop old table and rename new
                DROP TABLE transactions;
                ALTER TABLE transactions_new RENAME TO transactions;
                
                -- Recreate indexes
                CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
                CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
                CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
            `);

            console.log('✅ Transactions table migrated for nullable account_id');
        }
    } catch (error) {
        console.error('Account ID nullable migration error:', error.message);
    }
}

// Initialize schema and seed data
export function initializeDatabase() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    seedSystemCategories();

    // Migrate date column to allow NULL for pending transactions
    migrateDateNullable();

    // Add in_moneypot column to accounts if it doesn't exist
    migrateAccountsMoneyPot();

    // Make account_id nullable for reconciliation transactions
    migrateAccountIdNullable();

    // Add covering indexes for aggregate queries
    migrateIndexes();

    // Backfill the on-budget account flag (one-time)
    migrateOnBudgetFlag();

    // Backfill account display order (one-time)
    migrateAccountSortOrder();

    // Always ensure Balance Change has the correct icon
    db.prepare(`UPDATE categories SET icon = '/icons/balance_change.png' WHERE name = 'Balance Change' AND is_system = 1`).run();

    console.log('💰 MoneyWise database initialized at:', dbPath);
}

// Get current database path (for settings display)
export function getDatabasePath() {
    return dbPath;
}

export default db;
