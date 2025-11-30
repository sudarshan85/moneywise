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

## Feature: Category Budget Limits (v0.4.5-alpha)

### Overview

Allow users to set monthly spending limits for each category and display visual warnings on the Dashboard when actual spending exceeds those limits. This feature exposes the existing `monthly_budget` field in the Category model through the UI.

### Design Principles

- **Incremental enhancement**: Builds on top of Dashboard (Phase 3)
- **Single source of truth**: Budget limits stored in database, calculated in backend
- **Clear visual warnings**: Red indicators for overspending categories
- **Non-breaking**: $0 budgets treated as "no limit" (no warnings)

### Implementation Plan

#### Phase 1: Backend Schema Updates

**Task 1.1: Update CategoryCreate schema**
- File: `backend/schemas.py`
- Add `monthly_budget: Optional[float] = 0` field to CategoryCreate class (after line 54)
- Add Pydantic Field validation: `monthly_budget: Optional[float] = Field(0, ge=0)` (must be >= 0)
- Testing: Create category via API with budget, verify saved correctly

**Task 1.2: Update CategoryUpdate and CategoryResponse schemas**
- File: `backend/schemas.py`
- CategoryUpdate (line 57): Add `monthly_budget: Optional[float] = None`
- CategoryResponse (line 63): Add `monthly_budget: float` field
- Validation: monthly_budget >= 0
- Testing: Update category budget via PATCH, verify response includes budget

#### Phase 2: Configuration UI - Budget Editing

**Task 2.1: Add Monthly Budget column to categories table**
- File: `frontend/components/Configuration.js`
- Location: Categories table (line 251)
- Add `<th>Monthly Budget</th>` header between "Category Name" and "Actions"
- Add `<td>` cell with number input in edit mode
- Add `<td>` cell with formatted display in normal mode: `{{ formatAmount(category.monthly_budget || 0) }}`
- Input: `v-model.number="editingCategoryBudget"`, type="number", step="0.01", min="0"
- Testing: Verify column appears, displays budgets, allows editing

**Task 2.2: Update edit/save logic for budget field**
- File: `frontend/components/Configuration.js`
- Add to data(): `editingCategoryBudget: 0`
- Update `startEditCategory(id, name, budget)`: Set `this.editingCategoryBudget = budget || 0`
- Update `saveCategory(id)`: Include `monthly_budget: this.editingCategoryBudget` in PATCH call
- Update `cancelEdit()`: Clear `this.editingCategoryBudget = 0`
- Testing: Edit budget, save, verify persists; cancel, verify reverts

**Task 2.3: Add budget field to Add Category form**
- File: `frontend/components/Configuration.js`
- Location: Add category form (line 327)
- Add form-group with label "Monthly Budget (optional)"
- Input: `v-model.number="newCategory.monthly_budget"`, type="number", step="0.01", min="0", placeholder="0.00"
- Add to data(): `monthly_budget: 0` in newCategory object
- Update `addCategory()`: Include monthly_budget in API call
- Clear after add: `this.newCategory.monthly_budget = 0`
- Testing: Add category with budget, verify saved; add without budget, verify defaults to 0

#### Phase 3: Dashboard - Overspending Warnings

**Task 3.1: Add overspending detection methods**
- File: `frontend/components/Dashboard.js`
- Add method `isOverBudget(category)`:
  ```javascript
  isOverBudget(category) {
    return category.monthly_budget > 0 &&
           Math.abs(category.current_month_spending) > category.monthly_budget;
  }
  ```
- Add method `getOverspendingAmount(category)`:
  ```javascript
  getOverspendingAmount(category) {
    return Math.abs(category.current_month_spending) - category.monthly_budget;
  }
  ```
- Testing: Verify logic correctly identifies overspending

**Task 3.2: Add warning styling and indicators**
- File: `frontend/components/Dashboard.js`
- Update category row class binding (line 82): `:class="['category-row', { 'over-budget': isOverBudget(category) }]"`
- Add warning icon in category name cell (line 83): `<span v-if="isOverBudget(category)" class="warning-icon">⚠️</span>`
- Add overspending badge in Budgeted column (line 90):
  ```html
  <td class="col-budgeted">
    {{ formatAmount(category.monthly_budget) }}
    <span v-if="isOverBudget(category)" class="overspending-badge">
      Over by {{ formatAmount(getOverspendingAmount(category)) }}
    </span>
  </td>
  ```
- Testing: Verify icon and badge appear for overspending categories only

**Task 3.3: Add CSS styles**
- File: `frontend/static/styles.css`
- Add `.over-budget` row style: Red left border (4px solid #dc2626), light red background (rgba(220, 38, 38, 0.1))
- Add `.warning-icon` style: Amber/yellow color (#f59e0b), margin-right: 0.5rem
- Add `.overspending-badge` style: Red background (#dc2626), white text, rounded corners, padding, small font
- Add `.col-budgeted` style: Right-aligned text
- Add `.budget-input` style: Right-aligned number input in Configuration
- Testing: Verify visual styling looks good and stands out

#### Phase 4: Integration Testing

**Task 4.1: Test Configuration page budget editing**
- Navigate to Configuration → Categories section
- Verify "Monthly Budget" column appears in table
- Click Edit on existing category
- Change budget to $500.00, click Save
- Verify budget persists
- Edit again, press Escape without saving
- Verify budget didn't change

**Task 4.2: Test Add Category with budget**
- Navigate to Configuration
- Add new category "Test Groceries" with $400 budget
- Verify category created
- Add another category without budget
- Verify defaults to $0.00

**Task 4.3: Test Dashboard displays budgets**
- Navigate to Dashboard
- Verify all category budgets show in "Budgeted" column
- Verify values match what was set in Configuration
- Verify $0.00 for categories without budgets

**Task 4.4: Test overspending warnings**
- Set "Groceries" budget to $100
- In Transactions page, add outflow of $150 to Groceries
- Navigate to Dashboard
- Verify Groceries row has red styling
- Verify ⚠️ warning icon appears next to "Groceries"
- Verify "Over by $50.00" badge appears in Budgeted column
- Add another transaction of $50 (bringing total to $100)
- Refresh Dashboard
- Verify warnings disappear

**Task 4.5: Test edge cases**
- Set budget to $0 - verify no warnings show
- Set budget, add only inflows - verify no warnings triggered
- Set very small budget (0.01) - verify formatting works
- Set large budget (99999.99) - verify displays correctly
- Multiple categories over budget - verify each shows warnings independently

### Files to Modify

1. `backend/schemas.py` - Add monthly_budget to category schemas
2. `frontend/components/Configuration.js` - Add budget column and editing
3. `frontend/components/Dashboard.js` - Add warning logic and display
4. `frontend/static/styles.css` - Add budget warning styles

### Success Criteria

✅ Can set monthly budget when creating new category
✅ Can edit monthly budget for existing categories
✅ Budget persists across page refreshes
✅ Dashboard shows budget amounts in "Budgeted" column
✅ Dashboard shows red warning for overspending categories
✅ Warning icon (⚠️) appears next to overspending category names
✅ "Over by $X" badge shows exact overspending amount
✅ Visual indicators are clear and readable
✅ All edge cases handled correctly
