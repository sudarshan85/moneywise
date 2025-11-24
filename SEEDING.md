# Database Seeding Guide

## Overview

When developing MoneyWise, you often need to recreate the database with fresh test data. Instead of manually entering data through the UI each time, use the seed script to automatically populate the database from `sample_data.txt`.

## Quick Start

```bash
# 1. Edit sample_data.txt with your test data
# 2. Run the seed script
python scripts/seed_database.py
```

That's it! The database will be cleared and repopulated with your data.

## Sample Data Format

The `sample_data.txt` file uses a simple pipe-delimited format with sections for accounts, categories, and transactions.

### Structure

```
ACCOUNTS
Name | Type | Description
💰 360 Checking | bank | Capital One 360 Checking
💵 RH Cash | bank | Robinhood Individual Cash
💳 CO Venture | credit | Capital One Venture

CATEGORIES
Name
🍳 Natural Gas Bill
👩 Anitha Purchases
🏪 Household
💉 Medical

TRANSACTIONS
Date | Outflow | Inflow | Account | Category | Memo
11/21/2025 | 71.00 | | 💳 CO Venture | 🍳 Natural Gas Bill |
11/21/2025 | 21.82 | | 💳 CO Venture | 👩 Anitha Purchases | Amazon
11/21/2025 | 13.14 | | 💳 CO Venture | 🏪 Household | Amazon
11/21/2025 | 18.80 | | 💳 CO Venture | 💉 Medical | Amazon
```

### Field Descriptions

**ACCOUNTS Section:**
- `Name`: Account name (can include emojis) - must match names used in transactions
- `Type`: Either `bank` or `credit`
- `Description`: Optional description of the account

**CATEGORIES Section:**
- `Name`: Category name (can include emojis) - must match names used in transactions

**TRANSACTIONS Section:**
- `Date`: Transaction date in MM/DD/YYYY format
- `Outflow`: Amount spent (expenses/withdrawals) - leave blank if zero
- `Inflow`: Amount received (income/deposits) - leave blank if zero
- `Account`: Account name (must match an account defined in ACCOUNTS section)
- `Category`: Category name (must match a category defined in CATEGORIES section, or leave blank for uncategorized)
- `Memo`: Optional note/description for the transaction

## How to Use

1. **Copy your data from your spreadsheet** into the `sample_data.txt` file
2. **Run the seed script**: `python scripts/seed_database.py`
3. **The script will:**
   - Create database tables if they don't exist
   - Clear all existing data
   - Parse your sample data
   - Insert accounts, categories, and transactions
   - Display a summary of what was inserted

## Tips

- **Emojis are supported** - feel free to use them to make your test data more readable
- **Account/Category names must match** - the script validates that referenced accounts and categories exist
- **Dates must be MM/DD/YYYY format** - they're converted to YYYY-MM-DD for storage
- **Copy test data from your real spreadsheet** - only include data for features you've implemented
- **Run anytime you need fresh data** - it's non-destructive and quick

## Example Workflow

```bash
# 1. Delete database (optional - script handles this)
rm moneywise.db

# 2. Edit sample_data.txt with your test data
nano sample_data.txt

# 3. Seed the database
python scripts/seed_database.py

# 4. Start the app and test
python app.py
```

## Troubleshooting

**"Account 'X' not found"** - The account name in transactions doesn't match the ACCOUNTS section
- Fix: Check spelling and spacing (including emojis) match exactly

**"Category 'X' not found"** - The category name in transactions doesn't match the CATEGORIES section
- Fix: Check spelling and spacing (including emojis) match exactly
- Note: You can leave category blank for uncategorized transactions

**"no such table"** - Tables don't exist yet
- Fix: The script creates tables automatically, but make sure you have write permissions to the database file

## Future Enhancements

- CSV import via web UI
- Multi-file seeding
- Transaction templates
- Data validation with detailed error reports
