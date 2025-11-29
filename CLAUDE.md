# MoneyWise - Implementation Plan

MoneyWise is a personal budget and expense tracking application based on envelope budgeting principles, inspired by Aspire Budgeting, which is an extensive Google Sheets app. This is a desktop-first, locally-hosted web application for single-user financial management.

### Core Principles
- **Manual entry only** - No automatic bank sync (intentional for financial awareness)
- **Single database** - One SQLite database for all years of data
- **Frontend-first development** - Build UI first with placeholders, then connect to backend
- **Incremental testing** - User tests each feature with real data before proceeding to next phase
- **Simple & focused** - Clean scope, no feature creep in POC
- **Currency agnostic** - Display amounts in any currency with live exchange rates

---

## Project Structure

Create the following directory structure:

```
moneywise/
├── README.md                  (already exists)
├── LICENSE                    (already exists)
├── .gitignore                 (already exists)
├── CLAUDE.md                  (this file)
├── stretch.md                 (future features documentation)
├── config.toml                (user configuration - create on first run)
├── requirements.txt           (Python dependencies)
├── app.py                     (main entry point to launch the application)
├── moneywise.db              (SQLite database - created automatically)
├── backups/                   (automatic backups directory - created on first run)
├── backend/
│   ├── __init__.py
│   ├── main.py               (FastAPI application with all routes)
│   ├── database.py           (SQLAlchemy setup & session management)
│   ├── models.py             (SQLAlchemy ORM models for all tables)
│   ├── schemas.py            (Pydantic schemas for API validation)
│   ├── crud.py               (Database CRUD operations)
│   ├── config.py             (Configuration loader from TOML)
│   └── currency.py           (Exchange rate API integration)
└── frontend/
    ├── index.html            (Main HTML entry point)
    ├── app.js                (Vue.js root application)
    ├── router.js             (Vue Router configuration)
    ├── api.js                (API client functions for backend calls)
    ├── components/           (Vue components for each page)
    │   ├── Sidebar.js
    │   ├── CurrencySelector.js
    │   ├── Dashboard.js
    │   ├── Transactions.js
    │   ├── CategoryTransfers.js
    │   ├── Configuration.js
    │   └── reports/
    │       ├── AccountReports.js
    │       ├── Balances.js
    │       ├── SpendingReports.js
    │       ├── CategoryReports.js
    │       └── TrendReports.js
    └── static/
        └── styles.css        (Global CSS styles)
```

---

## Technology Stack & Package Usage

### Backend Packages (already installed via uv)
- **fastapi** - Web framework for building REST API
- **uvicorn[standard]** - ASGI server to run FastAPI application
- **sqlalchemy** - ORM for database operations and models
- **aiosqlite** - Async SQLite driver for SQLAlchemy
- **pydantic** - Data validation for API requests/responses
- **pydantic-settings** - Configuration management from TOML
- **tomli** - Parse TOML configuration files
- **tomli-w** - Write TOML configuration files
- **python-multipart** - Handle form data in FastAPI
- **httpx** - Async HTTP client for exchange rate API calls
- **python-dateutil** - Date manipulation utilities
- **aiofiles** - Async file operations for backups

### Frontend (CDN-loaded via index.html, no npm required)
- **Vue.js 3** - Progressive JavaScript framework for UI
- **Vue Router 4** - Client-side routing between pages
- **Chart.js 4** - Data visualization library for charts
- **Axios** - HTTP client for API calls to backend

---

## Default Configuration

Create `config.toml` in project root with these defaults (if file doesn't exist on first run):

```toml
[database]
path = "./moneywise.db"

[backup]
enabled = true
path = "./backups"
auto_backup_on_start = false

[ui]
currency_symbol = "$"
date_format = "MM/DD/YYYY"

[currency]
base_currency = "USD"
display_currency = "USD"
ticker_currencies = ["USD", "AED", "INR"]

[exchange_rates]
api_provider = "exchangerate-api"  # Free API, no key needed
api_url = "https://api.exchangerate-api.com/v4/latest/"
cache_duration_hours = 24
auto_update = true

[server]
host = "127.0.0.1"
port = 8000
auto_open_browser = true
```

---

## Database Schema

Design a SQLite database with the following tables using SQLAlchemy ORM:

### **accounts** table
- `id` - Integer primary key
- `name` - String, unique, not null (e.g., "Checking", "Wells Fargo Card")
- `account_type` - String, not null, either "bank" or "credit"
- `is_hidden` - Boolean, default False (for hiding old accounts)
- `created_at` - DateTime
- `updated_at` - DateTime

### **categories** table
- `id` - Integer primary key
- `name` - String, unique, not null (e.g., "Groceries", "Dining Out")
- `is_hidden` - Boolean, default False (for hiding old categories)
- `created_at` - DateTime
- `updated_at` - DateTime

### **category_renames** table
Track history when categories are renamed:
- `id` - Integer primary key
- `category_id` - Foreign key to categories
- `old_name` - String, not null
- `renamed_at` - DateTime, not null

### **transactions** table
- `id` - Integer primary key
- `date` - Date, not null
- `amount` - Decimal(12, 2), not null (positive = inflow, negative = outflow)
- `account_id` - Foreign key to accounts, not null
- `category_id` - Foreign key to categories, nullable (null for transfers)
- `memo` - String, nullable (description/note)
- `is_transfer` - Boolean, default False (true for account transfers)
- `transfer_id` - String, nullable (UUID linking paired transfer transactions)
- `created_at` - DateTime
- `updated_at` - DateTime

### **category_transfers** table
Moving money between budget categories:
- `id` - Integer primary key
- `date` - Date, not null
- `amount` - Decimal(12, 2), not null (always positive)
- `from_category_id` - Foreign key to categories, nullable (null if from "Available to budget")
- `to_category_id` - Foreign key to categories, not null
- `memo` - String, nullable
- `created_at` - DateTime

### **reconciliations** table
Track when accounts were reconciled:
- `id` - Integer primary key
- `account_id` - Foreign key to accounts, not null
- `reconciled_date` - Date, not null
- `created_at` - DateTime

### **exchange_rates** table
Cache currency exchange rates:
- `id` - Integer primary key
- `base_currency` - String(3), not null (e.g., "USD")
- `target_currency` - String(3), not null (e.g., "EUR")
- `rate` - Decimal(12, 6), not null
- `fetched_at` - DateTime, not null

**Important indexes to create:**
- Index on `transactions.date` for date range queries
- Index on `transactions.account_id` for filtering by account
- Index on `transactions.category_id` for filtering by category
- Index on `category_transfers.date` for date range queries
- Unique compound index on `exchange_rates(base_currency, target_currency)` for fast lookups

---

## Feature: Dashboard View (v0.4.0-alpha)

### Overview

The Dashboard provides a budget overview showing account balances, category balances, and "Available to budget" calculations. This is the primary view where users understand their financial position at a glance. The Dashboard replaces the category sidebar balance display in the Transactions page to eliminate redundancy.

### Design Principles

- **Single source of truth**: Category balances calculated once in backend, displayed in Dashboard only
- **Account-centric**: Show all account balances to see total available money
- **Category-centric**: Show all category balances to see how money is allocated
- **Month-focused**: Display current month spending separately from total balances
- **At-a-glance stats**: Top banner with key numbers (Available to budget, spent this month, etc.)

### Implementation Plan

#### Phase 1: Backend Dashboard Calculations

**Task 1.1: Add get_account_balances() to CRUD**
- File: `backend/crud.py`
- Function: Calculate balance for each account (sum of all transactions per account)
- Input: account_id (optional - if provided, get balance for one account; if None, get all)
- Output: Dict mapping account_id → balance (Decimal)
- Logic: Sum of (inflow - outflow) for all transactions in account
- Testing: Create transactions for multiple accounts, verify balances match manual calculation

**Task 1.2: Add get_category_balances() to CRUD**
- File: `backend/crud.py`
- Function: Calculate balance for each category (sum of all transactions per category)
- Input: category_id (optional - if provided, get balance for one; if None, get all)
- Output: Dict mapping category_id → balance (Decimal)
- Logic: Sum of (inflow - outflow) for all transactions in category
- Testing: Create transactions for multiple categories, verify balances correct

**Task 1.3: Add get_current_month_spending() to CRUD**
- File: `backend/crud.py`
- Function: Calculate current month spending by category
- Input: None (uses today's date to determine month)
- Output: Dict mapping category_id → spending amount (negative for outflow)
- Logic: Sum of transactions where date is in current month AND category_id matches
- Note: Should only sum outflows (negative amounts), ignore inflows
- Testing: Add transactions in current month and past months, verify filtering correct

**Task 1.4: Add get_available_to_budget() to CRUD**
- File: `backend/crud.py`
- Function: Calculate "Available to budget" = sum of all account balances
- Input: None
- Output: Decimal (single number)
- Logic: Sum of get_account_balances() for all accounts
- Note: This is total money in accounts (category transfers will reduce this later in Phase 5)
- Testing: Verify equals sum of all account balances

**Task 1.5: Add get_pending_transaction_count() to CRUD**
- File: `backend/crud.py`
- Function: Count transactions without a date (pending)
- Input: None
- Output: Integer count
- Logic: Count transactions where date IS NULL
- Testing: Create some pending transactions, verify count correct

#### Phase 2: Backend Dashboard Schemas

**Task 2.1: Create AccountWithBalance schema**
- File: `backend/schemas.py`
- Fields: id, name, account_type, balance (Decimal), last_transaction_date (optional)
- Validation: balance must be numeric

**Task 2.2: Create CategoryWithBalance schema**
- File: `backend/schemas.py`
- Fields: id, name, balance (Decimal), current_month_spending (Decimal), monthly_budget (Decimal)
- Validation: All amounts must be numeric
- Note: monthly_budget defaults to 0 if not set

**Task 2.3: Create DashboardResponse schema**
- File: `backend/schemas.py`
- Fields:
  - available_to_budget (Decimal)
  - spent_this_month (Decimal - total of all category outflows this month)
  - budgeted_this_month (Decimal - sum of all monthly_budget fields)
  - pending_count (int)
  - accounts (list of AccountWithBalance)
  - categories (list of CategoryWithBalance)
  - current_date (date)
- Validation: All Decimal fields must be numeric

#### Phase 3: Backend API Endpoint

**Task 3.1: Create GET /api/dashboard endpoint**
- File: `backend/main.py`
- Route: `GET /api/dashboard`
- Response: DashboardResponse schema
- Logic:
  1. Call get_available_to_budget()
  2. Call get_current_month_spending() for all categories, sum the outflows
  3. Get all categories with monthly_budget field, sum them
  4. Call get_pending_transaction_count()
  5. Get all accounts with get_account_balances(), include last_transaction_date from database
  6. Get all categories with get_category_balances() and get_current_month_spending()
  7. Build and return DashboardResponse
- Error handling: Return 500 if calculation fails, with error message
- Testing: Call endpoint, verify all fields present and correct

#### Phase 4: Frontend API Client

**Task 4.1: Add getDashboardData() function**
- File: `frontend/api.js`
- Function: Async function that calls GET /api/dashboard
- Returns: Promise resolving to dashboard data object
- Error handling: Catch and log errors, re-throw for component handling
- Testing: Call from console, verify data structure matches DashboardResponse

#### Phase 5: Frontend Dashboard Component

**Task 5.1: Create Dashboard template structure**
- File: `frontend/components/Dashboard.js`
- Layout:
  - Top banner (stat boxes)
  - Two-column layout: accounts sidebar (left) + categories table (right)
- Stat boxes (4 boxes in grid):
  - Available to budget (green box)
  - Spent this month (red box)
  - Budgeted this month (blue box)
  - Pending count (gray box)
- Each stat box shows: title, large number, currency symbol
- Testing: Verify layout renders without errors

**Task 5.2: Create accounts sidebar**
- File: `frontend/components/Dashboard.js`
- Display: List of all accounts with balances
- Columns: Account name, Balance
- Styling: Green text for positive balances, red for negative
- Show: "Last transaction: [date]" under each account
- Click behavior: No action yet (reserved for future drill-down)
- Testing: Verify all accounts display with correct balances and dates

**Task 5.3: Create categories table**
- File: `frontend/components/Dashboard.js`
- Display: Table of all categories with balance info
- Columns: Category, Available, Activity, Budgeted
- Column definitions:
  - Category: Category name
  - Available: Current category balance (color-coded green/red)
  - Activity: Current month spending only (negative in red)
  - Budgeted: Monthly budget limit (if set)
- Sorting: Alphabetical by category name
- Click behavior: No action yet (reserved for future drill-down)
- Testing: Verify all categories display with correct calculations

**Task 5.4: Load dashboard data on mount**
- File: `frontend/components/Dashboard.js`
- Hook: created() or mounted()
- Logic:
  1. Call getDashboardData()
  2. Store data in component state
  3. Calculate spent_this_month as sum of activity (already comes from backend)
  4. Format all numbers as currency
- Error handling: Show error message if data fails to load
- Testing: Navigate to Dashboard, verify data loads and displays

**Task 5.5: Add auto-refresh capability**
- File: `frontend/components/Dashboard.js`
- Feature: Optionally refresh data every 30 seconds (or on manual click)
- Implementation: Use setInterval or manual refresh button
- Testing: Verify data updates when transactions added in another window

#### Phase 6: Dashboard Styling

**Task 6.1: Add stat box styling**
- File: `frontend/static/styles.css`
- Class: `.stat-box`
- Styles:
  - Large card with colored background (green/red/blue/gray based on class)
  - Large bold number (font-size 32px)
  - Smaller label text
  - Box shadow and border radius
  - Responsive: Stack on small screens
- Variants:
  - `.stat-box-available` (green)
  - `.stat-box-spent` (red)
  - `.stat-box-budgeted` (blue)
  - `.stat-box-pending` (gray)

**Task 6.2: Add dashboard layout styling**
- File: `frontend/static/styles.css`
- Class: `.dashboard-container`
- Styles:
  - Main layout with sidebar (300px fixed) + content area
  - Flexbox layout
  - Responsive: On small screens, sidebar becomes full-width stacked

**Task 6.3: Add accounts sidebar styling**
- File: `frontend/static/styles.css`
- Class: `.dashboard-accounts-sidebar`
- Styles:
  - Card design with border
  - List of accounts
  - Account row: name on left, balance on right
  - Green text for positive, red for negative
  - Last transaction date in smaller gray text

**Task 6.4: Add categories table styling**
- File: `frontend/static/styles.css`
- Class: `.dashboard-categories-table`
- Styles:
  - Table with striped rows
  - Column headers with light background
  - Amount columns right-aligned
  - Color-coded amounts (green positive, red negative)
  - Hover effect on rows
  - Responsive: On very small screens, hide some columns or use horizontal scroll

**Task 6.5: Update Dashboard component import**
- File: `frontend/components/Dashboard.js`
- Add: Import api from '../api.js'
- Verify: CSS classes in template match defined styles

#### Phase 7: Remove Redundancy from Transactions Page

**Task 7.1: Remove category balance display from sidebar**
- File: `frontend/components/Transactions.js`
- Change: Remove the `.category-balance` span from category items
- Remove line: `<span class="category-balance" :class="{ negative: getCategoryBalance(category.id) < 0 }">{{ formatAmount(getCategoryBalance(category.id)) }}</span>`
- Result: Category sidebar shows only category names, no balances
- Testing: Navigate to Transactions page, verify sidebar shows categories without balances

**Task 7.2: Remove getCategoryBalance() method (if no longer used)**
- File: `frontend/components/Transactions.js`
- Check: If getCategoryBalance() is used elsewhere in the component (besides sidebar display)
- If only used for sidebar balances: Remove the method entirely
- If used elsewhere: Keep the method but remove only the sidebar usage
- Testing: Verify Transactions component still works (filter by category)

**Task 7.3: Remove calculateCategoryBalances() calls**
- File: `frontend/components/Transactions.js`
- Find: All calls to calculateCategoryBalances()
- Locations: likely in addTransaction(), updateTransaction(), deleteTransaction()
- Action: Remove these method calls (no longer needed, Dashboard will display balances)
- Testing: Add/edit/delete transactions, verify no errors

**Task 7.4: Remove categoryBalances state variable**
- File: `frontend/components/Transactions.js`
- In data(): Remove `categoryBalances: {}`
- In methods(): Remove entire calculateCategoryBalances() function definition
- Testing: Verify component mounts and functions normally

**Task 7.5: Update category sidebar styling**
- File: `frontend/static/styles.css`
- Check: `.category-item` and related classes
- Verify: Sidebar still looks good without balance display
- Optional: Add class to center category names vertically
- Testing: Transactions page sidebar renders cleanly

#### Phase 8: Integration Testing

**Task 8.1: Test dashboard loads correctly**
- Navigate to Dashboard
- Verify all 4 stat boxes display with correct values
- Verify account list shows all accounts with balances
- Verify categories table shows all categories
- Test: Create new transaction in different window, refresh Dashboard

**Task 8.2: Test calculations with sample data**
- Create several transactions across different accounts
- Verify account balances sum correctly
- Create transactions in current month and past months
- Verify "Spent this month" shows only current month spending
- Manually calculate and compare with Dashboard display

**Task 8.3: Test transactions page changes**
- Navigate to Transactions page
- Verify category sidebar shows only names (no balances)
- Verify category filtering still works
- Add/edit/delete transactions
- Verify no console errors
- Return to Dashboard and verify balances updated

**Task 8.4: Test responsive design**
- View Dashboard on narrow window (600px width)
- Verify layout doesn't break
- Verify tables/sidebars stack appropriately
- Check stat boxes remain readable
- Test Transactions page still functions

**Task 8.5: Test edge cases**
- Empty database (no transactions): Should show $0 everywhere
- Transactions with null category: Should not appear in category balances
- Multiple accounts with negative balances: Should display correctly in red
- No pending transactions: Count should be 0
- Future-dated transactions: Should still count in balances

#### Phase 9: User Acceptance Testing

**Task 9.1: User reviews Dashboard accuracy**
- User manually adds transactions
- User verifies Dashboard balances match expectations
- User checks that "Available to budget" equals total account balance
- User verifies "Spent this month" only includes current month
- User confirms all accounts and categories present

**Task 9.2: User confirms redundancy removal**
- User reviews Transactions page sidebar
- User confirms no duplicate balance information
- User verifies filtering still works
- User confirms simpler sidebar doesn't impact usability

**Task 9.3: User performance check**
- Load Dashboard with 50+ transactions
- Verify page loads quickly
- Verify no lag when navigating between pages

### Summary of Changes

**Files Modified**: 5
- `backend/crud.py` (5 new functions for calculations)
- `backend/schemas.py` (3 new schemas)
- `backend/main.py` (1 new API endpoint)
- `frontend/api.js` (1 new function)
- `frontend/components/Dashboard.js` (complete component implementation)
- `frontend/components/Transactions.js` (remove category balance display)
- `frontend/static/styles.css` (new Dashboard styles)

**Total Tasks**: 32 atomic, testable, verifiable tasks across 9 phases

**Implementation Order**: Backend (Phases 1-3) → Frontend (Phases 4-6) → Cleanup (Phase 7) → Testing (Phases 8-9)

**Key Principle**: No redundant data. Category balances calculated once, displayed in Dashboard only. Transactions page sidebar simplified to category names only for filtering.
