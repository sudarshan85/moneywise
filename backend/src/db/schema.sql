-- MoneyWise Database Schema
-- Envelope budgeting system

-- App Settings (key-value store)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Categories (envelopes)
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT,
    monthly_amount REAL DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    is_hidden INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Category Rename History (track name changes)
CREATE TABLE IF NOT EXISTS category_rename_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    old_name TEXT NOT NULL,
    new_name TEXT NOT NULL,
    changed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- Accounts (bank accounts, credit cards, investments, etc.)
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT,
    type TEXT NOT NULL CHECK(type IN ('bank', 'credit_card', 'cash', 'investment', 'retirement', 'loan')),
    is_hidden INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
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

-- Category Transfers (moving money between envelopes)
CREATE TABLE IF NOT EXISTS category_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    from_category_id INTEGER,
    to_category_id INTEGER,
    amount REAL NOT NULL,
    memo TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_category_id) REFERENCES categories(id),
    FOREIGN KEY (to_category_id) REFERENCES categories(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_category_transfers_date ON category_transfers(date);
