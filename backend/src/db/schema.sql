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
    in_moneypot INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
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
CREATE INDEX IF NOT EXISTS idx_category_transfers_from ON category_transfers(from_category_id, date);
CREATE INDEX IF NOT EXISTS idx_category_transfers_to ON category_transfers(to_category_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_cat_status_date ON transactions(category_id, status, date);
CREATE INDEX IF NOT EXISTS idx_transactions_acct_status ON transactions(account_id, status);

-- Sessions (for persistent authentication)
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Writes made by Claude through the MCP connector (backend/src/mcp/).
-- `changes` holds full before/after row images so any write can be undone.
CREATE TABLE IF NOT EXISTS mcp_writes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    tool TEXT NOT NULL,
    input TEXT NOT NULL,
    summary TEXT,
    changes TEXT NOT NULL,
    undone_at TEXT,
    undo_of INTEGER REFERENCES mcp_writes(id)
);

-- OAuth for the remote MCP connector (claude.ai web and phone; backend/src/mcp/oauth.js).
-- Codes, consent nonces and tokens are stored as SHA-256 hashes, never raw. Times are ms.
CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id TEXT PRIMARY KEY,
    info TEXT NOT NULL,              -- full registration response (JSON)
    created_at INTEGER NOT NULL
);

-- Bridges the password screen and the consent screen; single-use
CREATE TABLE IF NOT EXISTS oauth_consents (
    nonce_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_codes (
    code_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    grant_id TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    resource TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
);

-- One grant (a login + consent) owns a chain of rotated refresh tokens and their access tokens
CREATE TABLE IF NOT EXISTS oauth_tokens (
    token_hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK(kind IN ('access', 'refresh')),
    client_id TEXT NOT NULL,
    grant_id TEXT NOT NULL,
    resource TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_grant ON oauth_tokens(grant_id);
