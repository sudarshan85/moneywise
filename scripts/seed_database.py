#!/usr/bin/env python3
"""
Seed the MoneyWise database with sample data from sample_data.txt
Usage: python scripts/seed_database.py
"""

import sys
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

# Add parent directory to path to import backend modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.config import get_settings


def parse_sample_data(filepath):
    """Parse the sample_data.txt file and return accounts, categories, and transactions."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    accounts = []
    categories = []
    transactions = []

    sections = content.split('\n\n')

    for section in sections:
        lines = [line.strip() for line in section.split('\n') if line.strip()]
        if not lines:
            continue

        section_name = lines[0]

        if section_name == 'ACCOUNTS':
            # Skip header line
            for line in lines[2:]:
                if '|' in line:
                    parts = [p.strip() for p in line.split('|')]
                    if len(parts) >= 3:
                        accounts.append({
                            'name': parts[0],
                            'account_type': parts[1],
                            'description': parts[2] if len(parts) > 2 else ''
                        })

        elif section_name == 'CATEGORIES':
            # Skip header line
            for line in lines[2:]:
                if line and not line.startswith('Name'):
                    categories.append({'name': line})

        elif section_name == 'TRANSACTIONS':
            # Skip header line
            for line in lines[2:]:
                if '|' in line:
                    parts = [p.strip() for p in line.split('|')]
                    if len(parts) >= 5:
                        # Parse date (MM/DD/YYYY to YYYY-MM-DD)
                        date_str = parts[0]
                        try:
                            date_obj = datetime.strptime(date_str, '%m/%d/%Y')
                            date_formatted = date_obj.strftime('%Y-%m-%d')
                        except ValueError:
                            print(f"Warning: Invalid date format '{date_str}', skipping transaction")
                            continue

                        # Parse outflow and inflow
                        outflow_str = parts[1].strip()
                        inflow_str = parts[2].strip()

                        outflow = float(outflow_str) if outflow_str else 0.0
                        inflow = float(inflow_str) if inflow_str else 0.0

                        account_name = parts[3].strip()
                        category_name = parts[4].strip() if parts[4].strip() else None
                        memo = parts[5].strip() if len(parts) > 5 else ''

                        transactions.append({
                            'date': date_formatted,
                            'outflow': outflow,
                            'inflow': inflow,
                            'account_name': account_name,
                            'category_name': category_name,
                            'memo': memo
                        })

    return accounts, categories, transactions


def seed_database():
    """Seed the database with sample data using direct SQLite."""
    sample_file = Path(__file__).parent.parent / 'sample_data.txt'

    if not sample_file.exists():
        print(f"Error: {sample_file} not found!")
        sys.exit(1)

    print(f"Reading sample data from {sample_file}...")
    accounts_data, categories_data, transactions_data = parse_sample_data(sample_file)

    print(f"Parsed {len(accounts_data)} accounts, {len(categories_data)} categories, {len(transactions_data)} transactions")

    # Get database path
    settings = get_settings()
    db_path = settings.database_path

    print(f"\nConnecting to database at {db_path}...")

    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Create tables if they don't exist
        print("Creating tables if they don't exist...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                account_type VARCHAR(50) NOT NULL,
                description VARCHAR(500),
                is_hidden BOOLEAN DEFAULT 0,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                is_hidden BOOLEAN DEFAULT 0,
                monthly_budget NUMERIC(12, 2),
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY,
                date DATE,
                inflow NUMERIC(12, 2) NOT NULL DEFAULT 0,
                outflow NUMERIC(12, 2) NOT NULL DEFAULT 0,
                account_id INTEGER NOT NULL,
                category_id INTEGER,
                memo VARCHAR(500),
                is_transfer BOOLEAN DEFAULT 0,
                transfer_id VARCHAR(36),
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                FOREIGN KEY(account_id) REFERENCES accounts(id),
                FOREIGN KEY(category_id) REFERENCES categories(id)
            )
        """)
        conn.commit()

        # Clear existing data (in reverse order of foreign keys)
        print("Clearing existing data...")
        cursor.execute("DELETE FROM transactions")
        cursor.execute("DELETE FROM categories")
        cursor.execute("DELETE FROM accounts")
        conn.commit()

        # Insert accounts
        now = datetime.now(timezone.utc).isoformat()
        accounts_by_name = {}
        for acc_data in accounts_data:
            cursor.execute(
                """INSERT INTO accounts (name, account_type, description, is_hidden, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (acc_data['name'], acc_data['account_type'], acc_data['description'], False, now, now)
            )
            account_id = cursor.lastrowid
            accounts_by_name[acc_data['name']] = account_id

        conn.commit()
        print(f"✓ Inserted {len(accounts_data)} accounts")

        # Insert categories
        categories_by_name = {}
        for cat_data in categories_data:
            cursor.execute(
                """INSERT INTO categories (name, is_hidden, created_at, updated_at)
                   VALUES (?, ?, ?, ?)""",
                (cat_data['name'], False, now, now)
            )
            category_id = cursor.lastrowid
            categories_by_name[cat_data['name']] = category_id

        conn.commit()
        print(f"✓ Inserted {len(categories_data)} categories")

        # Insert transactions
        for txn_data in transactions_data:
            account_name = txn_data['account_name']
            category_name = txn_data['category_name']

            if account_name not in accounts_by_name:
                print(f"Warning: Account '{account_name}' not found, skipping transaction")
                continue

            account_id = accounts_by_name[account_name]
            category_id = None
            if category_name and category_name in categories_by_name:
                category_id = categories_by_name[category_name]
            elif category_name:
                print(f"Warning: Category '{category_name}' not found for transaction, treating as uncategorized")

            cursor.execute(
                """INSERT INTO transactions (date, inflow, outflow, account_id, category_id, memo, is_transfer, transfer_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    txn_data['date'],
                    txn_data['inflow'],
                    txn_data['outflow'],
                    account_id,
                    category_id,
                    txn_data['memo'] or None,
                    False,
                    None,
                    now,
                    now
                )
            )

        conn.commit()
        print(f"✓ Inserted {len(transactions_data)} transactions")

        print("\n✅ Database seeded successfully!")
        print("\nSummary:")
        print(f"  Accounts: {len(accounts_data)}")
        print(f"  Categories: {len(categories_data)}")
        print(f"  Transactions: {len(transactions_data)}")

    except Exception as e:
        conn.rollback()
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == '__main__':
    seed_database()
