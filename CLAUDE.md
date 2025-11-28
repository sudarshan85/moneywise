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

## Feature: Pending/Posted Transactions

### Overview

MoneyWise tracks when transactions are pending (not yet posted) vs posted (confirmed with final date). This is critical for credit cards and bank transfers which take time to post. A transaction is marked as pending by leaving the Date field empty, and automatically becomes posted once you fill in the Date.

### Design

- **Single Transactions Table** - Both pending and posted transactions appear in one table
- **Pending Indicator** - Rows without a date have a subtle yellow/amber background
- **Auto-Promotion** - Fill in the date field → transaction automatically becomes posted
- **Sorting** - Pending transactions (no date) appear at top sorted by creation time, followed by posted transactions sorted by date (newest first)
- **Fields**:
  - Date: **Optional** (NULL = pending, filled = posted)
  - Outflow/Inflow: **Required** (one must be non-zero)
  - Account: **Required**
  - Category: **Optional**
  - Memo: **Optional**

### Workflow Example

1. **Wife sends you shopping split** (Jan 15, but transaction not posted yet)
   - Enter: Outflow=$45, Account=Chase CC, Category=Groceries
   - Leave Date empty
   - Transaction appears at top with yellow background (pending)

2. **Transaction posts in credit card** (Jan 17)
   - Click on the date cell for that transaction
   - Enter the date (Jan 17)
   - Transaction background changes to normal (posted)
   - Automatically sorted with other posted transactions

### Implementation Plan

#### Phase 1: Database Schema

**Task 1.1: Make Transaction.date Nullable**
- File: `backend/models.py` (Transaction class)
- Change: `date = Column(Date, nullable=True)`
- Testing: Create transaction without date, verify it saves with NULL date in database

#### Phase 2: Pydantic Schemas

**Task 2.1: Update TransactionCreate Schema**
- File: `backend/schemas.py` (TransactionCreate class)
- Change: `date: Optional[date] = None`
- Testing: POST request without date field, verify 201 response with null date

**Task 2.2: Update TransactionUpdate Schema**
- File: `backend/schemas.py` (TransactionUpdate class)
- Change: `date: Optional[date] = None`
- Testing: PATCH request without date field, verify transaction unchanged

**Task 2.3: TransactionResponse Schema**
- File: `backend/schemas.py` (TransactionResponse class)
- Status: No changes needed (already supports null dates)
- Testing: Fetch transactions, verify null dates in response

#### Phase 3: Backend CRUD Sorting

**Task 3.1: Update get_transactions() Sorting**
- File: `backend/crud.py` (get_transactions function)
- Change: Use SQL CASE expression to sort pending (by created_at DESC) before posted (by date DESC)
- Testing: Create pending/posted transactions, verify pending always appears first

#### Phase 4: Frontend Form Validation

**Task 4.1: Remove Date Validation from Add Transaction**
- File: `frontend/components/Transactions.js` (addTransaction method)
- Change: Remove date from required field check, keep account and amount validation
- Testing: Add pending transaction without date, verify it's created

**Task 4.2: Remove Date Validation from Edit Transaction**
- File: `frontend/components/Transactions.js` (updateTransaction method)
- Change: Remove date from required field check, keep account and amount validation
- Testing: Edit pending transaction without changing date, verify update succeeds

#### Phase 5: Frontend Visual Styling

**Task 5.1: Add CSS for Pending Transactions**
- File: `frontend/static/styles.css`
- Add: `.pending-transaction { background-color: rgba(251, 191, 36, 0.15); }` with pulse animation
- Add: `.posted-transaction { background-color: transparent; }`
- Testing: Verify pending rows have yellow/amber background

**Task 5.2: Apply CSS Classes to Rows**
- File: `frontend/components/Transactions.js` (table row template)
- Change: Add `:class="transaction.date ? 'posted-transaction' : 'pending-transaction'"`
- Testing: Verify CSS classes applied, add/edit date changes background color

#### Phase 6: Client-Side Sorting

**Task 6.1: Verify Frontend Sort Order**
- File: `frontend/components/Transactions.js` (filteredTransactions method)
- Status: No changes needed (already uses backend sort order)
- Testing: Create mixed pending/posted, verify correct sort with filters applied

#### Phase 7: Integration Testing

**Task 7.1: End-to-End Workflow**
- Create pending transaction (no date)
- Verify it appears at top with yellow background
- Edit to add date
- Verify it becomes posted with normal background
- Test with multiple pending/posted and filters

#### Phase 8: Edge Cases

**Task 8.1: Test Edge Cases**
- No amount specified → error
- No account specified → error
- Multiple edits to pending transaction → stays pending until date added
- Remove date from posted transaction → becomes pending again
- Filters preserve pending/posted order

**Task 8.2: Documentation Update**
- Document pending vs posted in user guide
- Explain that empty date = pending
- Explain visual distinction

### Summary

**Files Modified**: 5
- `backend/models.py` (1 change)
- `backend/schemas.py` (2 schemas)
- `backend/crud.py` (sorting logic)
- `frontend/components/Transactions.js` (validation + styling)
- `frontend/static/styles.css` (new styles)

**Total Tasks**: 11 atomic, user-testable tasks

**Implementation Order**: Backend (Phases 1-3) → Frontend (Phases 4-5) → Testing (Phases 6-8)