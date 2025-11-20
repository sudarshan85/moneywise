# MoneyWise - Implementation Plan

**Version:** POC (Proof of Concept) → v1.0.0
**Environment:** Python with `uv` virtual environment (already created and activated)
**Tech Stack:** FastAPI + SQLite + Vue.js + Chart.js
**Development Approach:** Frontend-first, incremental testing after each feature

---

## Project Overview

MoneyWise is a personal budget and expense tracking application based on envelope budgeting principles, inspired by Aspire Budgeting. This is a desktop-first, locally-hosted web application for single-user financial management.

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

## Implementation Phases

### Phase 0: Project Foundation (v0.1.0-alpha)
**Goal:** Create a launchable application shell that user can immediately open in browser.

#### What to Build:
1. **Project structure**: Create all directories and empty `__init__.py` files where needed
2. **Configuration management** (`backend/config.py`):
   - Use `tomli` to read from `config.toml`
   - Use `pydantic-settings` to create Settings class
   - Create default `config.toml` if it doesn't exist
   - Provide a global `settings` object accessible throughout backend
3. **Database setup** (`backend/database.py`):
   - Configure SQLAlchemy async engine with `aiosqlite`
   - Create declarative base class
   - Provide async session factory with FastAPI dependency injection
   - Create `init_db()` async function to create all tables
4. **Database models** (`backend/models.py`):
   - Define all SQLAlchemy ORM models matching schema above
   - Set up relationships (e.g., Transaction.account, Transaction.category)
   - Use appropriate SQLAlchemy types (String, Integer, Boolean, DateTime, Date, Numeric)
5. **Basic FastAPI backend** (`backend/main.py`):
   - Create FastAPI app with CORS middleware (allow localhost origins)
   - Mount static file serving for frontend directory
   - Add startup event handler to call init_db()
   - Create health check endpoint: `GET /api/health` returns `{"status": "healthy"}`
6. **Main entry point** (`app.py`):
   - Use `uvicorn.run()` to start FastAPI app
   - Read host/port from settings
   - Auto-open browser if configured
7. **Frontend shell** (`frontend/index.html`):
   - Load Vue.js 3, Vue Router, Chart.js, Axios from CDN
   - Create `<div id="app"></div>` mount point
   - Import all component JavaScript files as modules
8. **Vue.js app** (`frontend/app.js`):
   - Create root Vue application using `Vue.createApp()`
   - Register Vue Router
   - Include Sidebar component in main layout
9. **Vue Router** (`frontend/router.js`):
   - Define routes for all pages (dashboard, transactions, category-transfers, configuration, all 5 reports)
   - Use HTML5 history mode
   - Export router for use in app.js
10. **Sidebar navigation** (`frontend/components/Sidebar.js`):
    - Vue component with "MoneyWise" title
    - `<router-link>` elements for all main pages
    - Collapsible "Reports" section with all report types
11. **Placeholder pages**: Create Vue components for:
    - Dashboard.js, Transactions.js, CategoryTransfers.js, Configuration.js
    - All report components (AccountReports.js, Balances.js, SpendingReports.js, CategoryReports.js, TrendReports.js)
    - Each should just display page title and "Coming soon..." message
12. **Basic styling** (`frontend/static/styles.css`):
    - Flexbox layout: fixed sidebar + scrollable main content
    - Modern, clean design with readable fonts
    - Blue/gray color scheme
    - Sidebar dark background with white text
    - Main content light background

#### Testing Checklist for User:
- [ ] Run `python app.py` from project root
- [ ] Browser automatically opens to http://127.0.0.1:8000
- [ ] See MoneyWise sidebar with all navigation links
- [ ] Click through all navigation links - each shows placeholder page
- [ ] No errors in browser console (F12)
- [ ] Check that `moneywise.db` file was created in project root
- [ ] Visit http://127.0.0.1:8000/api/health and see `{"status": "healthy"}`
- [ ] Stop server (Ctrl+C) and restart - everything still works

**⏳ Phase 0 Incomplete - Awaiting user testing and approval**

---

### Phase 1: Configuration Management (v0.2.0-alpha)
**Goal:** Allow users to create, view, edit, hide, and delete accounts and categories through the UI.

**Status:** ⏳ Not Started

#### What to Build:

1. **Pydantic schemas** (`backend/schemas.py`):
   - Create Pydantic BaseModel classes for API request/response validation
   - Schemas needed: AccountCreate, AccountUpdate, AccountResponse, CategoryCreate, CategoryUpdate, CategoryResponse
   - Include field validation (e.g., name min length 1, account_type enum)
   - CategoryResponse should have `renamed_history` field (list of renames)

2. **CRUD operations** (`backend/crud.py`):
   - Write async functions for accounts: create, get_by_id, get_all, update, delete
   - Write async functions for categories: create, get_by_id, get_all, update, delete
   - When updating category name, automatically create a record in `category_renames` table
   - Write function to get rename history for a category
   - Use `selectinload` for eager loading relationships
   - Handle exceptions gracefully

3. **API endpoints** (`backend/main.py` - add to existing file):
   - RESTful endpoints for accounts: GET /api/accounts, POST /api/accounts, GET /api/accounts/{id}, PATCH /api/accounts/{id}, DELETE /api/accounts/{id}
   - Same pattern for categories: /api/categories/*
   - Use FastAPI dependency injection for database sessions
   - Return appropriate HTTP status codes (200, 201, 404, 400)
   - Use Pydantic schemas for request/response models

4. **Frontend API client** (`frontend/api.js`):
   - Create JavaScript module with reusable API functions using Axios
   - Functions for accounts: getAccounts(), createAccount(), updateAccount(), deleteAccount()
   - Functions for categories: getCategories(), createCategory(), updateCategory(), deleteCategory()
   - Base URL constant pointing to backend
   - Error handling with try/catch

5. **Configuration UI** (`frontend/components/Configuration.js`):
   - Vue component with reactive data
   - **Accounts section**:
     - Two separate subsections: "Bank Accounts/Cash" and "Credit Cards"
     - Table for each showing account names
     - Inline editing: click Edit, input appears, Save/Cancel buttons
     - Hide/Unhide toggle button
     - Delete button with confirmation
     - "Show Hidden" checkbox to display hidden accounts
     - Add new account form at bottom (name input, type selector, Add button)
   - **Categories section**:
     - Single table showing all categories
     - Inline editing capability
     - ⓡ indicator for renamed categories (blue, clickable/hoverable)
     - Tooltip on hover showing full rename history with dates
     - Hide/Unhide and Delete buttons
     - Add new category form at bottom
   - Use Vue methods for all CRUD operations
   - Call API functions from api.js
   - Show alerts on success/error

6. **Styling** (`frontend/static/styles.css` - add to existing):
   - CSS Grid for two-column account layout
   - Table styling with borders and hover effects
   - Button styling (primary blue, danger red, success green, secondary gray)
   - Rename indicator (ⓡ) styling
   - Form styling
   - Editable fields: light blue background (#e8f4f8)
   - Read-only fields: light gray background (#f8f9fa)

#### Testing Checklist for User:
- [ ] Navigate to Configuration page
- [ ] **Test Accounts:**
  - [ ] Add a bank account (e.g., "Checking") - verify it appears
  - [ ] Add a credit card (e.g., "Visa Card") - verify it appears in Credit Cards section
  - [ ] Edit an account name inline - verify name updates
  - [ ] Hide an account - verify it disappears
  - [ ] Check "Show Hidden" - verify hidden account appears with "Unhide" button
  - [ ] Unhide an account - verify it reappears in normal list
  - [ ] Delete an account - verify confirmation dialog, then removal
- [ ] **Test Categories:**
  - [ ] Add multiple categories (Groceries, Dining Out, Gas, Mortgage, etc.)
  - [ ] Edit a category name - verify ⓡ indicator appears
  - [ ] Hover over ⓡ - verify tooltip shows rename history with date
  - [ ] Rename the same category again - verify tooltip shows both renames
  - [ ] Hide/unhide categories - verify functionality
  - [ ] Delete a category - verify removal
- [ ] **Test Persistence:**
  - [ ] Close browser and reopen app
  - [ ] Verify all accounts and categories still present
  - [ ] Verify rename history preserved

**⏳ Phase 1 Incomplete - Awaiting user testing and approval**

---

### Phase 1.5: Category Budget Limits (v0.2.5-alpha)
**Goal:** Set monthly spending limits for each category and display warnings when spending exceeds the limit.

**Status:** ⏳ Not Started

#### Concept Clarification:
This feature implements the **maximum spending amount** for each category per month (envelope budgeting). This is different from Category Transfers (Phase 4):
- **Category Budget Limit** (this phase): The maximum amount you *plan* to spend in each category per month (e.g., "Groceries: $500/month")
- **Category Transfers** (Phase 4): Each month you *allocate* money from your income into categories (moving money into envelopes)
- **Budget vs Actual**: When actual spending exceeds the budget limit, show red warning indicators

#### What to Build:

1. **Database schema update** (`backend/models.py`):
   - Add `monthly_budget` column to `categories` table (Decimal(12, 2), nullable, default 0)
   - This represents the maximum spending limit for the category per month
   - **Database migration** (`backend/database.py`): Add migration to ALTER existing categories table

2. **Backend schemas** (`backend/schemas.py` - update existing):
   - Add `monthly_budget` field to CategoryCreate, CategoryUpdate, CategoryResponse
   - Validation: monthly_budget must be >= 0

3. **Backend CRUD** (`backend/crud.py` - update existing):
   - Update category CRUD operations to handle monthly_budget field
   - Budget comparison functions deferred to Phase 3 (Dashboard)

4. **Frontend API client** (`frontend/api.js` - already supports monthly_budget via existing endpoints):
   - No changes needed (PATCH endpoint already accepts any category fields)

5. **Configuration UI** (`frontend/components/Configuration.js`):
   - Add "Monthly Budget" column to categories table
   - Inline editing for monthly budget (click Edit, shows number input, Save/Cancel)
   - Display budget as currency ($0.00 format)
   - Updated add category form with budget input field

6. ⏳ **Budget Warning System** (for later phases - Dashboard/Transactions):
   - When displaying categories, compare actual spending vs budget limit
   - If actual spending > monthly_budget, show:
     - Red background or border
     - ⚠️ warning icon
     - Overspending badge (e.g., "Over by $50.00")
   - This will be implemented in Dashboard (Phase 3) and Transaction views (Phase 2)

7. **Styling** (`frontend/static/styles.css` - add to existing):
   - Budget column styling in categories table (blue display, right-aligned)
   - Add form grid layout for name + budget inputs
   - Responsive design for mobile

#### Testing Checklist for User:
- [ ] Navigate to Configuration page
- [ ] **Test Category Budget Limits:**
  - [ ] See "Monthly Budget" column in categories table
  - [ ] Click Edit on a category, see budget input field
  - [ ] Set budget for Groceries (e.g., $500.00), click Save
  - [ ] Set budgets for multiple categories
  - [ ] Verify budgets display correctly
  - [ ] Edit an existing budget, verify update works
  - [ ] Set budget to $0 (should work for categories without budgets)
- [ ] **Test Persistence:**
  - [ ] Close browser and reopen app
  - [ ] Verify all category budgets preserved
- [ ] **Test Database Migration:**
  - [ ] Existing categories loaded correctly after adding monthly_budget column
  - [ ] All existing categories default to $0.00 budget

**⏳ Phase 1.5 Incomplete - Awaiting user testing and approval**

**Note:** Warning indicators for overspending will be implemented in Phase 3 (Dashboard) when we can calculate actual vs budgeted spending.

---

### Phase 2: Transaction Management & Currency (v0.3.0-alpha)
**Goal:** Add, view, edit, and delete transactions. Display amounts in any currency with live exchange rates.

**Status:** ⏳ Not Started

#### What to Build:

1. **Exchange rate service** (`backend/currency.py`):
   - Create `CurrencyService` class
   - Method to fetch rates from https://api.exchangerate-api.com/v4/latest/{base} using `httpx` async client
   - Method to get cached rate from database (check `exchange_rates` table first)
   - If rate is older than configured cache duration, fetch new rate
   - Method to convert amount between currencies
   - Method to update all rates for configured currencies
   - Handle API errors gracefully (fallback to cached or 1.0 rate)

2. **Transaction schemas** (`backend/schemas.py` - add to existing):
   - TransactionCreate, TransactionUpdate, TransactionResponse Pydantic models
   - Validation: date required, amount required (can be negative), account_id required
   - Response schema should include account_name and category_name for display

3. **Transaction CRUD** (`backend/crud.py` - add to existing):
   - Create, get_by_id, get_all (with filters), update, delete for transactions
   - Filters: account_id, category_id, start_date, end_date, limit
   - Order by date descending
   - Use `selectinload` to load account and category relationships
   - Helper function to get ticker rates for configured currencies

4. **API endpoints** (`backend/main.py` - add to existing):
   - Transaction CRUD: GET /api/transactions, POST /api/transactions, GET /api/transactions/{id}, PATCH /api/transactions/{id}, DELETE /api/transactions/{id}
   - Currency endpoints: GET /api/currency/rates (params: base, targets), POST /api/currency/refresh, GET /api/currency/convert
   - Support query parameters for filtering transactions

5. **Currency selector component** (`frontend/components/CurrencySelector.js`):
   - Vue component with dropdown for currency selection
   - Display exchange rate ticker showing rates for configured currencies
   - Refresh button to manually update rates
   - Save selected currency to localStorage
   - Emit event when currency changes
   - Auto-refresh rates every 5 minutes using setInterval

6. **Frontend API client** (`frontend/api.js` - add to existing):
   - Add transaction CRUD functions
   - Add currency functions (getExchangeRates, refreshExchangeRates, convertCurrency)

7. **Transactions UI** (`frontend/components/Transactions.js`):
   - **Layout**: CSS Grid with category picker sidebar (~250px) + main area
   - **Header**: Include CurrencySelector component
   - **Category picker** (left sidebar):
     - List all categories as clickable items
     - Highlight selected category
     - Show category balance when category selected
   - **Main area**:
     - **Add transaction form** at top (horizontal layout):
       - Date input, Amount input (number, allow negative), Account dropdown, Category dropdown, Memo input, Add button
       - Style editable fields with light blue background
     - **Transactions table**:
       - Columns: Date, Amount, Account, Category, Memo, Actions
       - Color-code amounts: red for negative (outflow), green for positive (inflow)
       - Sort by date descending
       - Actions: Edit button (switches row to inline edit mode), Delete button
       - Edit mode: swap text for inputs, show Save/Cancel buttons
   - Load accounts and categories on mount for dropdowns
   - Refresh transaction list after any CRUD operation

8. **Styling** (`frontend/static/styles.css` - add to existing):
   - Currency selector styling (flex layout, ticker boxes)
   - Transactions grid layout
   - Transaction form styling (grid layout for inputs)
   - Transaction table styling with color-coded amounts
   - Category picker styling (hover effects, selected state)

#### Testing Checklist for User:
- [ ] Navigate to Transactions page
- [ ] **Test Currency Selector:**
  - [ ] Currency dropdown appears
  - [ ] Exchange ticker shows rates for AED and INR
  - [ ] Click refresh button - verify rates update
  - [ ] Change display currency - verify selection saved
- [ ] **Test Add Transaction:**
  - [ ] Add outflow: negative amount (e.g., -50.00), verify appears in red
  - [ ] Add inflow: positive amount (e.g., 2000.00), verify appears in green
  - [ ] Add multiple transactions with different dates
- [ ] **Test View Transactions:**
  - [ ] Verify transactions sort newest first
  - [ ] Verify account/category names display correctly
- [ ] **Test Edit Transaction:**
  - [ ] Click Edit, modify fields, click Save - verify changes persist
  - [ ] Click Edit, then Cancel - verify no changes made
- [ ] **Test Delete Transaction:**
  - [ ] Click Delete, confirm - verify transaction removed
- [ ] **Test Category Picker:**
  - [ ] Click category in sidebar - verify highlights
  - [ ] Verify category balance displays (sum of transactions in that category)
  - [ ] Add transaction to category - verify balance updates
- [ ] **Test Persistence:**
  - [ ] Close and reopen app - verify all transactions present
- [ ] **Test with Real Data:**
  - [ ] Add 10-20 real transactions from your life

**⏳ Phase 2 Incomplete - User must test with real transaction data and approve before proceeding to Phase 3.**

---

### Phase 3: Dashboard View (v0.4.0-alpha)
**Goal:** Display budget overview with account balances, category balances, and "Available to budget" amount.

**Status:** ⏳ Not Started

#### What to Build:

1. **Dashboard calculations** (`backend/crud.py` - add to existing):
   - Calculate account balances (sum of all transactions per account)
   - Calculate category balances (sum of transactions + category_transfers per category)
   - Calculate "Available to budget" = (sum of all account balances) - (sum of all category balances)
   - Calculate current month activity per category
   - Get last transaction date for each account
   - All calculations on-the-fly from transaction data

2. **Dashboard schemas** (`backend/schemas.py` - add to existing):
   - Create response schemas for dashboard data structure
   - Budget overview, account with balance, category with balances

3. **API endpoints** (`backend/main.py` - add to existing):
   - GET /api/dashboard - return comprehensive dashboard data:
     - Budget overview stats (available to budget, spent this month, budgeted this month, pending count)
     - List of accounts with balances and last transaction dates
     - List of categories with available, activity, budgeted amounts

4. **Frontend API client** (`frontend/api.js` - add to existing):
   - Add getDashboardData() function

5. **Dashboard UI** (`frontend/components/Dashboard.js`):
   - **Top banner**: Grid of stat boxes showing:
     - Available to budget (green)
     - Spent this month (red)
     - Budgeted this month (blue - show $0 for now)
     - Pending transactions (gray - show 0)
   - **Layout**: Sidebar (~300px) + main area
   - **Accounts sidebar**:
     - List each account with name, balance, last transaction date
     - Color-code: green for positive, red for negative
   - **Main area - Categories table**:
     - Columns: Category, Available, Activity, Budgeted
     - Available: current balance (colored green/red based on positive/negative)
     - Activity: current month spending (show negative in red)
     - Budgeted: show $0 for now
     - Sort alphabetically or by amount
   - Show current date at top
   - Load data on mount

6. **Styling** (`frontend/static/styles.css` - add to existing):
   - Stat boxes with colored backgrounds
   - Dashboard grid layout
   - Accounts sidebar card design
   - Categories table with color-coded amounts

#### Testing Checklist for User:
- [ ] Navigate to Dashboard
- [ ] **Test Overview Banner:**
  - [ ] Verify "Available to budget" calculation correct
  - [ ] Add transaction, reload, verify updates
  - [ ] Verify "Spent this month" shows current month outflows
- [ ] **Test Accounts Sidebar:**
  - [ ] Verify all accounts listed with correct balances
  - [ ] Verify balances match transaction sums
  - [ ] Verify color coding (green/red)
  - [ ] Verify last transaction dates
- [ ] **Test Categories Table:**
  - [ ] Verify all categories listed
  - [ ] Verify "Available" column calculations
  - [ ] Add transaction, reload, verify Available updates
  - [ ] Verify "Activity" shows current month only
  - [ ] Verify overspent categories in red
- [ ] **Test Calculations:**
  - [ ] Manually verify: sum of account balances
  - [ ] Verify Available to budget makes sense
- [ ] **Test with Real Data:**
  - [ ] Verify dashboard numbers match expectations

**⏳ Phase 3 Incomplete - User must verify all calculations before proceeding to Phase 4.**

---

### Phase 4: Category Transfers (v0.5.0-alpha)
**Goal:** Move money between categories to allocate budget (envelope budgeting).

**Status:** ⏳ Not Started

#### What to Build:

1. **Category transfer calculations** (`backend/crud.py` - add to existing):
   - Calculate category balances including transfers
   - Calculate Available to budget (accounts - categories)
   - Transfers from null category_id mean from "Available to budget"

2. **Category transfer schemas** (`backend/schemas.py` - add to existing):
   - Create Pydantic models for category transfers
   - Fields: date, amount (positive only), from_category_id (nullable), to_category_id, memo

3. **Category transfer CRUD** (`backend/crud.py` - add to existing):
   - Create, get_all (with date filters), update, delete for category_transfers
   - Get transfers by date range
   - Get transfers for specific category

4. **API endpoints** (`backend/main.py` - add to existing):
   - Category transfer CRUD: GET /api/category-transfers, POST /api/category-transfers, etc.

5. **Frontend API client** (`frontend/api.js` - add to existing):
   - Add category transfer CRUD functions

6. **Category Transfers UI** (`frontend/components/CategoryTransfers.js`):
   - **Top section**: Large display of "Available to budget" amount
   - **Category picker**: Dropdown to select category and see its current balance
   - **Transfers table**:
     - Columns: Date, Amount, From Category, To Category, Memo, Actions
     - Show "Available to budget" for null from_category_id
     - Edit/Delete actions
   - **Add transfer form**:
     - Date, Amount, From Category (with "Available to budget" option), To Category, Memo, Add button
   - Refresh Available to budget display after transfers

7. **Styling** (`frontend/static/styles.css` - add to existing):
   - Prominent Available to budget display
   - Transfer table and form styling

#### Testing Checklist for User:
- [ ] Navigate to Category Transfers
- [ ] **Test Available to Budget:**
  - [ ] Verify amount matches Dashboard
- [ ] **Test Add Transfer:**
  - [ ] Transfer $500 from "Available to budget" to "Groceries"
  - [ ] Verify Available to budget decreases
  - [ ] Verify Groceries balance increases (check Dashboard)
  - [ ] Transfer $100 from "Groceries" to "Dining Out"
  - [ ] Verify both categories update
- [ ] **Test Edit/Delete:**
  - [ ] Edit transfer amount - verify recalculation
  - [ ] Delete transfer - verify Available to budget increases back
- [ ] **Test Real Budget:**
  - [ ] Allocate your real budget across categories
  - [ ] Aim for Available to budget = $0
- [ ] **Test Math:**
  - [ ] Sum of (all category Available + Available to budget) = sum of account balances

**⏳ Phase 4 Incomplete - User must verify budget allocation before proceeding to Phase 5.**

---

### Phase 5: Reconciliation (v0.6.0-alpha)
**Goal:** Mark when accounts were reconciled to match real bank balances.

**Status:** ⏳ Not Started

#### What to Build:

1. **Reconciliation CRUD** (`backend/crud.py` - add to existing):
   - Create, get_by_account, delete for reconciliation records
   - Get last reconciliation date for each account

2. **Reconciliation schemas** (`backend/schemas.py` - add to existing):
   - Pydantic models for reconciliations

3. **API endpoints** (`backend/main.py` - add to existing):
   - Reconciliation endpoints: GET /api/reconciliations, POST /api/reconciliations, GET /api/reconciliations/account/{id}, DELETE /api/reconciliations/{id}

4. **Frontend API client** (`frontend/api.js` - add to existing):
   - Add reconciliation functions

5. **Update Transactions UI** (`frontend/components/Transactions.js`):
   - Add reconciliation section showing "Last reconciled on: [date]" or "Not reconciled"
   - Add "Mark as Reconciled" button with date picker
   - Show reconciliation points in transaction list with marker

6. **Update Dashboard** to show last reconciled date under accounts

#### Testing Checklist for User:
- [ ] Navigate to Transactions
- [ ] **Test Reconciliation:**
  - [ ] Check real bank balance
  - [ ] Verify MoneyWise shows same balance
  - [ ] Click "Mark as Reconciled"
  - [ ] Verify date displays
  - [ ] Check Dashboard shows date under account
  - [ ] Reconcile all accounts
- [ ] **Test After More Transactions:**
  - [ ] Add new transactions
  - [ ] Verify last reconciled date doesn't change
  - [ ] Reconcile again with new date

**⏳ Phase 5 Incomplete - User must test with real bank statements before proceeding to Phase 6.**

---

### Phase 6-10: Reports

Build all 5 report types following similar patterns:
- Backend: calculations in crud.py, API endpoint in main.py
- Frontend: API client function, Vue component with filters/charts/tables, styling

**Phase 6 (v0.7.0-alpha): Account Reports**
**Status:** ⏳ Not Started
- Transaction history and charts for individual accounts over time
- Filters: account selector, time period
- Chart: monthly inflow/outflow/balance using Chart.js
- Tables: monthly stats and transaction list

**Phase 7 (v0.7.5-alpha): Balances**
**Status:** ⏳ Not Started
- Settled transactions by account with balances
- Account selector
- Balance display (actual = settled for now)
- Transaction list in reverse chronological order

**Phase 8 (v0.8.0-alpha): Spending Reports**
**Status:** ⏳ Not Started
- Spending by category over date range
- Filters: date range, optional category
- Chart: horizontal bar chart of categories (outflow/inflow)
- Tables: category totals, transaction list when category selected

**Phase 9 (v0.8.5-alpha): Category Reports**
**Status:** ⏳ Not Started
- Deep dive into single category's history
- Filters: category, time period, facet (balance/budgeted/activity)
- Chart: selected facet over time
- Tables: monthly data, transactions for selected month

**Phase 10 (v0.9.0-alpha): Trend Reports**
**Status:** ⏳ Not Started
- Multi-category trends with stacked charts
- Filters: time period, multi-select categories (max 6)
- Chart: stacked bar/area chart showing all selected categories
- Tables: transaction list for selected category and month

Each report phase follows same pattern:
1. Build calculations in backend
2. Create API endpoint
3. Build Vue component with filters, Chart.js visualization, data tables
4. Style consistently
5. User tests with real data before next phase

---

### Phase 11: Account Transfers (v0.9.5-alpha)
**Goal:** Transfer money between accounts with auto-linked transactions.

**Status:** ⏳ Not Started

#### What to Build:

1. **Account transfer logic** (`backend/crud.py` - add to existing):
   - When creating account transfer, create TWO linked transactions:
     - Outflow from source account (negative amount)
     - Inflow to destination account (positive amount)
   - Both get same UUID `transfer_id`
   - Both marked `is_transfer = True`
   - Both get `category_id = None`
   - If one deleted, automatically delete the other

2. **Transfer endpoints** (`backend/main.py` - add to existing):
   - POST /api/transfers/account - create paired transactions
   - DELETE /api/transfers/{transfer_id} - delete both
   - PATCH /api/transfers/{transfer_id} - update both

3. **Frontend API client** (`frontend/api.js` - add to existing):
   - Add account transfer functions

4. **Update Transactions UI** (`frontend/components/Transactions.js`):
   - Add "Account Transfer" button/option
   - Show different form: Date, Amount (positive), From Account, To Account, Memo
   - In table, show ↕️ indicator for transfers
   - Delete warns about deleting both sides

5. **Validation**: Cannot transfer to same account, amount must be positive

#### Testing Checklist for User:
- [ ] **Test Create Transfer:**
  - [ ] Transfer $500 from Checking to Savings
  - [ ] Verify TWO transactions created (one negative, one positive)
  - [ ] Verify both have ↕️ indicator
- [ ] **Test Balances:**
  - [ ] Verify Checking decreased by $500
  - [ ] Verify Savings increased by $500
  - [ ] Total unchanged
- [ ] **Test Edit/Delete:**
  - [ ] Edit one side - verify both update
  - [ ] Delete - verify both deleted
- [ ] **Test with Real Transfers:**
  - [ ] Record real transfer between accounts

**⏳ Phase 11 Incomplete - User must verify before proceeding to Phase 12.**

---

### Phase 12: Backup & Export (v1.0.0-beta)
**Goal:** Automatic database backups and manual export.

**Status:** ⏳ Not Started

#### What to Build:

1. **Backup functionality** (`backend/backup.py` - new file):
   - Create backup service class
   - Function to create timestamped backup
   - Function to list backups
   - Function to restore from backup
   - Auto-backup on startup if configured
   - Keep last N backups (configurable)
   - Use `aiofiles` for async operations

2. **Export functionality** (`backend/export.py` - new file):
   - Export transactions to CSV
   - Export category transfers to CSV
   - Export all data to JSON
   - Support filtered exports

3. **API endpoints** (`backend/main.py` - add to existing):
   - POST /api/backup/create, GET /api/backup/list, POST /api/backup/restore/{id}
   - GET /api/export/transactions, GET /api/export/all (with filters)
   - Set file download headers

4. **Frontend API client** (`frontend/api.js` - add to existing):
   - Add backup/export functions
   - Handle file downloads

5. **Add Backup/Export to Configuration page**:
   - Backups section: Create button, list of backups with Restore/Delete buttons
   - Export section: Export buttons, date range filters

6. **Update app.py** to backup on startup if configured

#### Testing Checklist for User:
- [ ] **Test Manual Backup:**
  - [ ] Click "Create Backup Now"
  - [ ] Verify backup in list with timestamp
  - [ ] Verify file in backups/ directory
- [ ] **Test Auto Backup:**
  - [ ] Enable in config
  - [ ] Restart app
  - [ ] Verify backup created
- [ ] **Test Export CSV:**
  - [ ] Export transactions
  - [ ] Open in Excel
  - [ ] Verify all data present and correct
- [ ] **Test Export JSON:**
  - [ ] Export all data
  - [ ] Verify valid JSON format
- [ ] **Test Restore (CAREFUL!):**
  - [ ] Add test transaction
  - [ ] Restore old backup
  - [ ] Verify data reverted (test transaction gone)
- [ ] **Test Backup Rotation:**
  - [ ] Create 15+ backups
  - [ ] Verify only last 10 kept

**⏳ Phase 12 Incomplete - User must test backup/restore before v1.0.0.**

---

## Final Testing & v1.0.0 Release

Before v1.0.0:
1. Complete end-to-end workflow test with fresh start
2. Add real accounts, categories, transactions
3. Use app for 1-2 months in parallel with Google Sheets
4. Compare and verify accuracy
5. Fix any bugs found
6. Polish UI and add loading indicators
7. Update README with documentation
8. Verify performance with 1000+ transactions
9. Ready for daily use!

---

## Success Criteria

POC successful when:
1. ⏳ All features working correctly
2. ⏳ Calculations verified accurate
3. ⏳ User trusts app for daily budgeting
4. ⏳ Performs well with real data
5. ⏳ User prefers over Google Sheets

---

## Important Notes for Agent

### Code Quality:
- Write clean, commented code
- Use async/await throughout
- Handle errors with try/catch
- Validate all inputs
- Use type hints in Python
- Follow PEP 8 and ES6+ standards
- Use Decimal for currency (never float!)

### Development Workflow:
1. Read phase requirements
2. Plan implementation
3. Build backend (models, CRUD, API)
4. Build frontend UI
5. Connect frontend to backend
6. Test yourself first
7. Provide testing checklist
8. Wait for user approval
9. Fix issues
10. Get approval before next phase

### Communication:
- Summarize what was built after each phase
- List files created/modified
- Provide clear testing instructions
- Ask clarifying questions
- Suggest improvements
- Wait for approval before proceeding
