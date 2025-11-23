# MoneyWise - Implementation Plan

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

### Currently working on Phase 2: Transaction Management & Currency (v0.3.0-alpha)
**Goal:** Add, view, edit, and delete transactions. Display amounts in any currency with live exchange rates.

**Status:** ⏳ Started

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