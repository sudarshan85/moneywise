### Phase 2.5: UI/UX Enhancements (v0.3.5-alpha)
**Goal:** Improve user experience with keyboard shortcuts, responsive layout fixes, and status indicators.

**Status:** ⏳ Not Started

#### What to Build:

1. **Dropdown Auto-Filter with Keyboard Shortcut** (`frontend/components/Transactions.js`):
   - Convert standard `<select>` dropdowns to custom filterable dropdowns (Account, Category fields)
   - Behavior: Typing a letter filters options matching that letter, auto-selects if only 1 match remains
   - Works in Add Transaction form and Edit mode table rows
   - Implementation: Replace `<select>` with custom Vue component or inline logic
   - **User UX**: Same behavior as Google Sheets dropdowns - press first letter to jump/filter
   - **Note**: Keep browser's native select for now, explore custom component if needed

2. **Sidebar Toggle/Hide** (`frontend/components/Transactions.js`):
   - Add collapse/expand button for category picker sidebar
   - Persist sidebar state to localStorage
   - When collapsed, sidebar becomes narrow icon-only bar
   - Main content expands to fill space
   - Useful for narrow browser windows or when focusing on form

3. **Responsive Layout Fixes** (`frontend/static/styles.css`):
   - Fix horizontal scrolling issues on narrow windows (< 1200px width)
   - Ensure transaction form and table don't force horizontal scroll
   - Use CSS Grid `fr` units and `min-content` for responsive behavior
   - Test at 50% window width (common tiling scenario)
   - Consider collapsing sidebar by default on small screens

4. **Transaction Status Column** (`frontend/components/Transactions.js`):
   - Add "Status" column to transactions table (between Date and Amount)
   - Default status: "Pending" (💰 emoji) for new transactions
   - User can toggle between "Pending" (💰) and "Posted" (✓)
   - Status field in database: `status` column in transactions table (stored as string)
   - Allow click-to-toggle or dropdown
   - Different styling for posted vs pending (gray text for posted, bold for pending)

#### Testing Checklist for User:
- [ ] **Test Keyboard Filtering:**
  - [ ] Click Account dropdown, press 'C' key - should filter to accounts starting with C
  - [ ] If only one match, verify it auto-selects
  - [ ] Type more letters to narrow further
  - [ ] Works in both add form and edit mode
- [ ] **Test Sidebar Toggle:**
  - [ ] Click collapse button (< or > icon)
  - [ ] Sidebar collapses to narrow bar with icons
  - [ ] Main area expands
  - [ ] Close browser and reopen - sidebar state persists
  - [ ] Sidebar expands back with click
- [ ] **Test Responsive Layout:**
  - [ ] Tile browser to 50% width
  - [ ] No horizontal scroll bar appears
  - [ ] All form fields visible without scrolling
  - [ ] Table truncates gracefully or scrolls only table horizontally
- [ ] **Test Transaction Status:**
  - [ ] New transaction shows 💰 (Pending) in Status column
  - [ ] Click status to toggle between 💰 and ✓
  - [ ] Edit then save - status preserved
  - [ ] Refresh page - status persists
  - [ ] Status updates immediately without page reload

**⏳ Phase 2.5 Incomplete - User must test UI enhancements before proceeding to Phase 3.**

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

### Phase 4: Category Budget Limits (v0.4.5-alpha)
**Goal:** Set monthly spending limits for each category and display warnings when spending exceeds the limit.

**Status:** ⏳ Not Started

#### Concept Clarification:
This feature implements the **maximum spending amount** for each category per month (envelope budgeting). This is different from Category Transfers (Phase 5):
- **Category Budget Limit** (this phase): The maximum amount you *plan* to spend in each category per month (e.g., "Groceries: $500/month")
- **Category Transfers** (Phase 5): Each month you *allocate* money from your income into categories (moving money into envelopes)
- **Budget vs Actual**: When actual spending exceeds the budget limit, show red warning indicators

#### What to Build:

1. **Database schema** - Already ready:
   - `monthly_budget` column already exists in `categories` table
   - Just need to populate it through UI

2. **Backend schemas** (`backend/schemas.py` - update existing):
   - Add `monthly_budget` field to CategoryCreate, CategoryUpdate, CategoryResponse
   - Validation: monthly_budget must be >= 0

3. **Backend CRUD** (`backend/crud.py` - update existing):
   - Update category CRUD operations to handle monthly_budget field
   - Budget comparison functions implemented in Phase 3 (Dashboard)

4. **Frontend API client** (`frontend/api.js` - already supports monthly_budget via existing endpoints):
   - No changes needed (PATCH endpoint already accepts any category fields)

5. **Configuration UI** (`frontend/components/Configuration.js` - update existing):
   - Add "Monthly Budget" column to categories table
   - Inline editing for monthly budget (click Edit, shows number input, Save/Cancel)
   - Display budget as currency ($0.00 format)
   - Updated add category form with budget input field

6. **Dashboard Integration** (`frontend/components/Dashboard.js`):
   - Add comparison logic to show budget warnings
   - If actual spending > monthly_budget, show:
     - Red background or border
     - ⚠️ warning icon
     - Overspending badge (e.g., "Over by $50.00")
   - Display "Budgeted" column with budget limit

7. **Styling** (`frontend/static/styles.css` - add to existing):
   - Budget column styling in categories table (blue display, right-aligned)
   - Warning indicators styling (red, icons, badges)
   - Responsive design

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
- [ ] **Test Dashboard Integration:**
  - [ ] View Dashboard
  - [ ] See budgeted amounts in categories table
  - [ ] Add transactions that exceed budget
  - [ ] Verify warning indicators appear in red
  - [ ] Verify overspending badge shows correct amount

**⏳ Phase 4 Incomplete - Awaiting user testing and approval**

---

### Phase 5: Category Transfers (v0.5.0-alpha)
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

**⏳ Phase 5 Incomplete - User must verify budget allocation before proceeding to Phase 6.**

---

### Phase 6: Reconciliation (v0.6.0-alpha)
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

**⏳ Phase 6 Incomplete - User must test with real bank statements before proceeding to Phase 7.**

---

### Phase 7-11: Reports

Build all 5 report types following similar patterns:
- Backend: calculations in crud.py, API endpoint in main.py
- Frontend: API client function, Vue component with filters/charts/tables, styling

**Phase 7 (v0.7.0-alpha): Account Reports**
**Status:** ⏳ Not Started
- Transaction history and charts for individual accounts over time
- Filters: account selector, time period
- Chart: monthly inflow/outflow/balance using Chart.js
- Tables: monthly stats and transaction list

**Phase 8 (v0.7.5-alpha): Balances**
**Status:** ⏳ Not Started
- Settled transactions by account with balances
- Account selector
- Balance display (actual = settled for now)
- Transaction list in reverse chronological order

**Phase 9 (v0.8.0-alpha): Spending Reports**
**Status:** ⏳ Not Started
- Spending by category over date range
- Filters: date range, optional category
- Chart: horizontal bar chart of categories (outflow/inflow)
- Tables: category totals, transaction list when category selected

**Phase 10 (v0.8.5-alpha): Category Reports**
**Status:** ⏳ Not Started
- Deep dive into single category's history
- Filters: category, time period, facet (balance/budgeted/activity)
- Chart: selected facet over time
- Tables: monthly data, transactions for selected month

**Phase 11 (v0.9.0-alpha): Trend Reports**
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

### Phase 12: Account Transfers (v0.9.5-alpha)
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

**⏳ Phase 12 Incomplete - User must verify before proceeding to Phase 13.**

---

### Phase 13: Backup & Export (v1.0.0-beta)
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

**⏳ Phase 13 Incomplete - User must test backup/restore before v1.0.0.**

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
