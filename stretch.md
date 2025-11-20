# MoneyWise - Stretch Goals & Future Features

This document contains ideas for features to implement after the POC is complete and stable. These are not part of the initial implementation plan but can be added incrementally once the core application is working well.

---

## Priority Stretch Goals

### 1. Auto-Categorization using Machine Learning
**Description:** Automatically suggest categories for new transactions based on patterns from past transactions.

**How it works:**
- Train a simple ML model on historical transaction data
- Look at memo text, amount patterns, account used
- Suggest category when adding new transaction
- User can accept suggestion or choose different category
- Model improves over time as user corrects suggestions

**Implementation notes:**
- Use scikit-learn for text classification
- Features: memo text (TF-IDF), amount range, account, day of week
- Store model in backend, retrain periodically
- Add "Accept Suggestion" button in transaction form

---

### 2. Budget Recommendations
**Description:** Analyze historical spending patterns and suggest optimal budget allocations.

**Features:**
- Analyze 3-6 months of spending history
- Identify average spending per category
- Detect seasonal patterns (e.g., higher gas in summer)
- Suggest Monthly Amount for each category
- Flag categories where spending consistently exceeds budget
- Recommend areas to cut spending based on goals

**Implementation notes:**
- Add new endpoint: GET /api/recommendations
- Calculate statistics: mean, median, std dev per category
- Provide confidence intervals
- Display in Dashboard or new "Insights" page

---

### 3. Recurring Transaction Templates
**Description:** Save frequently used transactions as templates for quick entry.

**Features:**
- Create template from existing transaction or from scratch
- Template stores: account, category, amount, memo
- Quick-add button to create transaction from template
- Edit template without affecting past transactions
- Schedule reminders for recurring bills

**Implementation notes:**
- New table: `transaction_templates`
- Fields: name, account_id, category_id, amount, memo, is_recurring
- UI: "Save as Template" button on transaction form
- UI: "Templates" section with quick-add buttons

---

### 4. Monthly Amount & Goal Amount Features
**Description:** Implement the full Aspire Budgeting Monthly Amount and Goal Amount features.

**Features:**
- Set Monthly Amount for each category (target funding each month)
- Set Goal Amount for long-term savings categories
- Dashboard shows ⚑ indicator for categories with goals
- Mini pie charts showing progress toward goal
- Category Transfers page suggests amount needed to meet monthly target
- Track goal progress over time

**Implementation notes:**
- Add columns to categories table: monthly_amount, goal_amount
- Update Dashboard calculations to show progress
- Add visual indicators (pie charts using Chart.js)
- Update Category Transfers UI to show suggestions

---

### 5. Split Transactions
**Description:** Single transaction that splits across multiple categories.

**Features:**
- Mark transaction as "split"
- Enter one total amount
- Allocate portions to different categories
- Display as single line in transaction list, expandable to show splits
- Edit/delete affects all splits

**Implementation notes:**
- New table: `transaction_splits`
- Fields: transaction_id, category_id, amount, memo
- UI: "Split Transaction" option in add form
- Modal or inline form to enter splits

---

## Nice-to-Have Stretch Goals

### 6. Pending Transactions Support
**Description:** Import and track pending transactions from banks.

**Features:**
- Flag transactions as pending (🅿️) or settled (✅)
- Pending transactions show in special "tray" at top
- Balances calculated separately: actual = pending + settled
- When pending settles, convert to settled
- Category selection on pending transaction carries over to settled

**Implementation notes:**
- Add `is_pending` boolean to transactions table
- Update balance calculations to separate pending/settled
- UI updates in Transactions and Balances tabs

---

### 7. Category Groups
**Description:** Organize categories into collapsible groups.

**Features:**
- Create category groups (e.g., "Monthly Bills", "Discretionary")
- Assign categories to groups
- Collapse/expand groups in Dashboard
- Sum totals by group

**Implementation notes:**
- New table: `category_groups`
- Add `group_id` foreign key to categories table
- Update Configuration UI to manage groups
- Update Dashboard to show grouped categories

---

### 8. Net Worth Tracking
**Description:** Track assets and debts outside the budget.

**Features:**
- Define net worth categories (e.g., "Home Value", "Student Loans", "401k")
- Enter values periodically
- Chart showing net worth over time
- Separate from budgeted accounts

**Implementation notes:**
- New table: `net_worth_categories`
- New table: `net_worth_entries` (category_id, value, date)
- New report page: Net Worth Report

---

### 9. Receipt Attachments
**Description:** Attach photos/PDFs to transactions.

**Features:**
- Upload receipt images
- Link to specific transaction
- View receipt when reviewing transactions
- Search transactions by receipt contents (OCR stretch)

**Implementation notes:**
- New table: `attachments` (transaction_id, file_path, file_type)
- Store files in uploads/ directory
- Add file upload to transaction form
- Display thumbnail in transaction list

---

### 10. Budget Scenarios
**Description:** Test different budget allocations without affecting real budget.

**Features:**
- Create named scenario (e.g., "What if I increase dining budget?")
- Adjust category allocations
- See projected impact on Available to budget
- Compare scenarios side by side
- Apply scenario to actual budget when satisfied

**Implementation notes:**
- New table: `budget_scenarios`
- Store scenario allocations separate from real budget
- UI: "Scenarios" page with scenario manager
- Visual comparison charts

---

### 11. Multi-Year Trend Analysis
**Description:** Enhanced reporting across multiple years.

**Features:**
- Year-over-year comparison charts
- Average annual spending per category
- Identify long-term trends
- Inflation-adjusted views

**Implementation notes:**
- Add year-over-year filters to Trend Reports
- New aggregation functions in backend
- Multi-year stacked charts

---

### 12. Dark Mode
**Description:** Dark color scheme for the UI.

**Features:**
- Toggle between light and dark themes
- Save preference in localStorage
- Smooth transition between themes
- Chart colors optimized for dark background

**Implementation notes:**
- Add CSS variables for theme colors
- Add theme toggle in sidebar header
- Update Chart.js color schemes based on theme

---

### 13. Mobile-Responsive Design
**Description:** Optimize UI for mobile devices.

**Features:**
- Responsive layouts using CSS media queries
- Touch-friendly buttons and inputs
- Collapsible sidebar on mobile
- Simplified transaction entry on small screens

**Implementation notes:**
- Add media queries to styles.css
- Test on various screen sizes
- Consider mobile-first design patterns

---

## Advanced Stretch Goals

### 14. Web Hosting with Multi-User Support
**Description:** Deploy app to web server and support multiple users.

**Features:**
- User registration and authentication
- Each user has separate database/budget
- Secure password storage
- Session management
- Optional: Shared household budgets

**Implementation notes:**
- Add user authentication (JWT tokens)
- Add users table and user_id foreign keys to all tables
- Deploy to cloud (Heroku, AWS, DigitalOcean)
- Add HTTPS with SSL certificate
- Update all queries to filter by user_id

---

### 15. Bank Sync / Plaid Integration
**Description:** Automatically import transactions from banks.

**Features:**
- Connect to bank accounts via Plaid API
- Auto-import new transactions
- Auto-categorize using ML model
- Detect duplicates
- Review imported transactions before accepting

**Implementation notes:**
- Sign up for Plaid API
- Add Plaid Link flow to connect accounts
- Create background job to sync daily
- Match imported transactions to categories
- UI for reviewing and accepting imports

---

### 16. Shared Budgets / Household Accounts
**Description:** Multiple users sharing a single budget.

**Features:**
- Invite family members to budget
- Each user can add transactions
- Role-based permissions (admin, editor, viewer)
- Activity log showing who made changes
- Optional: Per-user categories or allowances

**Implementation notes:**
- Add budget_users table (many-to-many)
- Add role and permissions system
- Track created_by on transactions
- UI for inviting and managing users

---

### 17. API for Third-Party Integrations
**Description:** Public API for external tools to access MoneyWise data.

**Features:**
- RESTful API with authentication
- OAuth2 for third-party apps
- Webhooks for transaction events
- API documentation (Swagger/OpenAPI)
- Rate limiting

**Implementation notes:**
- API already built (FastAPI endpoints)
- Add API key system
- Add OAuth2 provider
- Generate API documentation
- Add rate limiting middleware

---

### 18. Email/SMS Notifications
**Description:** Send alerts and reports via email or SMS.

**Features:**
- Weekly/monthly budget summary emails
- Alerts when category overspent
- Alerts when bill due (if recurring transactions implemented)
- Low balance warnings
- Reconciliation reminders

**Implementation notes:**
- Add email service (SendGrid, Mailgun)
- Add notification preferences to user settings
- Create background job for scheduled emails
- HTML email templates

---

### 19. Budget Goals & Savings Challenges
**Description:** Gamification to encourage saving.

**Features:**
- Set savings goals with target date
- Track progress with visual indicators
- Celebrate milestones
- Challenges: "No dining out for a week", "Save $100 extra this month"
- Achievements and badges

**Implementation notes:**
- Add goals table
- Add achievements/badges table
- Progress tracking logic
- Gamification UI elements

---

### 20. Advanced Analytics Dashboard
**Description:** Interactive analytics with drill-downs.

**Features:**
- Customizable dashboard widgets
- Drag-and-drop layout
- Advanced charts (sankey, treemap, heatmap)
- Filter and drill-down capabilities
- Export charts as images
- Scheduled PDF reports

**Implementation notes:**
- Add dashboard configuration storage
- Use advanced Chart.js features or D3.js
- Add PDF generation library
- Background job for scheduled reports

---

## Implementation Strategy for Stretch Goals

Once POC is stable (v1.0.0+):
1. Choose one feature from Priority Stretch Goals
2. Discuss requirements with user
3. Create detailed implementation plan (like CLAUDE.md format)
4. Implement incrementally with testing
5. Release as minor version (e.g., v1.1.0)
6. Repeat

---

## Notes

- Stretch goals should not compromise core app stability
- Each feature should be thoroughly tested before next
- Consider user feedback when prioritizing
- Some features (like bank sync) have ongoing costs to consider
- Multi-user features require security audit
- Start simple, add complexity gradually

---

**This is a living document** - add new ideas as they come up during POC development and usage!
