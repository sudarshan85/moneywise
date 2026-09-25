# Future Work

Planned features and improvements that are not yet implemented.

---

## MCP Write Access (Claude desktop → MoneyWise)

Let Claude desktop record transactions, settle pending charges, move envelope money
and record account transfers, with an approval prompt on every write. Writes go
through the production API; reads stay on the local copy. Detailed plan, API
reference, open questions and test plan: **`docs/plans/mcp-write-access.md`**.
Phase 2 there outlines a remote (web/phone) connector behind OAuth.

---

## Manual Category Ordering

Allow users to manually drag-and-drop category cards on the dashboard to set a custom order, with a toggle to switch between automatic and manual ordering.

### Database Changes

```sql
-- Add column to categories table
ALTER TABLE categories ADD COLUMN dashboard_sort_order INTEGER DEFAULT NULL;
-- NULL = use automatic ordering, Integer = manual position (1, 2, 3, ...)

-- Add setting for ordering mode
INSERT INTO app_settings (key, value) VALUES ('dashboard_ordering', 'auto');
-- Values: 'auto' or 'manual'
```

### Backend Changes

**GET /api/dashboard**
- Check `dashboard_ordering` setting
- If `'auto'`: use current tiered ordering (count tiers → activity)
- If `'manual'`: order by `dashboard_sort_order ASC NULLS LAST`

**PUT /api/categories/reorder** — new endpoint:
```javascript
router.put('/reorder', (req, res) => {
    const { categoryOrder } = req.body; // Array of { id, position }
    // Update each category's dashboard_sort_order
});
```

**PUT /api/settings/dashboard-ordering** — new endpoint:
```javascript
router.put('/dashboard-ordering', (req, res) => {
    const { mode } = req.body; // 'auto' or 'manual'
    // Update app_settings
});
```

### Frontend Changes

**Dashboard.jsx**
1. Add toggle UI — small button/switch near category section header (`📊 Sort: [Auto] [Manual]`)
2. When switching to Manual, show subtle drag handles on cards
3. Use `react-beautiful-dnd` or `@dnd-kit/core` for drag-and-drop
4. On drag end, call reorder API (optimistic update)

**Configuration Store** — add `dashboardOrdering` state, `setDashboardOrdering(mode)`, and `reorderCategories(order)` actions.

### Edge Cases
- New categories added: go to end of manual list
- Categories hidden/deleted: order adjusts automatically
- Switching from Manual → Auto: manual order preserved in DB for next time

### Implementation Order
1. Database migration (add column + setting)
2. Backend endpoints (reorder + toggle)
3. Frontend toggle UI
4. Drag-and-drop integration
5. Testing and polish

---

## Mobile Responsive + PWA

Make MoneyWise work on mobile devices and installable as a homescreen app.

**Requirements:** Dashboard and Transactions are primary pages. All pages accessible on mobile. No offline support needed. Add-to-Homescreen capability (PWA).

### Phase 1: PWA Setup

Create `frontend/public/manifest.json`:
```json
{
  "name": "MoneyWise",
  "short_name": "MoneyWise",
  "description": "Personal envelope budgeting app",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#F5A623",
  "icons": [
    { "src": "/icons/moneywise_icon.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/moneywise_icon.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Add to `frontend/index.html` `<head>`:
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#F5A623">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/icons/moneywise_icon.png">
```

### Phase 2: Global Responsive CSS (`frontend/src/index.css`)

```css
@media (max-width: 768px) {
  .app-header { padding: var(--space-sm) var(--space-md); }
  .app-header h1 { font-size: var(--font-size-lg); }

  /* Bottom nav on mobile */
  .tab-nav {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 100;
    background: var(--bg-card);
    border-top: 1px solid var(--border-light);
    border-bottom: none;
    padding: var(--space-xs);
    justify-content: space-around;
  }
  .tab-button { flex-direction: column; gap: 2px; padding: var(--space-xs); font-size: 0.65rem; }
  .tab-button .emoji { font-size: 1.25rem; }
  .main-content { padding: var(--space-md); padding-bottom: 80px; }
}

@media (max-width: 480px) {
  .app-header h1 { font-size: var(--font-size-base); }
  .app-logo { height: 24px; width: 24px; }
  .main-content { padding: var(--space-sm); padding-bottom: 80px; }
}
```

### Phase 3: Dashboard Mobile CSS

```css
@media (max-width: 768px) {
  .budget-overview { grid-template-columns: repeat(2, 1fr); gap: var(--space-sm); }
  .details-section { display: none; } /* use modal instead */
  .category-section { overflow-x: auto; }
}
@media (max-width: 480px) {
  .budget-overview { grid-template-columns: 1fr; }
}
```

### Phase 4: Transactions Mobile CSS

```css
@media (max-width: 768px) {
  .transactions-header { flex-direction: column; gap: var(--space-sm); }
  .filter-controls { flex-wrap: wrap; gap: var(--space-xs); }
  .filter-controls select, .filter-controls input { flex: 1 1 45%; min-width: 120px; }
  .transactions-table-container { overflow-x: auto; }
  .transactions-table { min-width: 600px; }
  .col-account { display: none; }
  .selection-summary { flex-direction: column; gap: var(--space-sm); padding: var(--space-sm); }
}
```

### Phase 5: Other Pages

**Transfers.css:**
```css
@media (max-width: 768px) {
  .transfer-form { grid-template-columns: 1fr; }
  .transfers-table-container { overflow-x: auto; }
}
```

**Configuration.css:**
```css
@media (max-width: 768px) {
  .config-header { flex-direction: column; gap: var(--space-sm); }
  .items-grid { grid-template-columns: 1fr; }
  .settings-grid { grid-template-columns: 1fr; }
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `frontend/public/manifest.json` | NEW — PWA manifest |
| `frontend/index.html` | Add PWA meta tags |
| `frontend/src/index.css` | Mobile breakpoints, bottom nav |
| `frontend/src/pages/Dashboard.css` | Enhanced mobile breakpoints |
| `frontend/src/pages/Transactions.css` | Mobile breakpoints |
| `frontend/src/pages/Transfers.css` | Mobile breakpoints |
| `frontend/src/pages/Configuration.css` | Mobile breakpoints |

### Design Decisions
- Bottom navigation (more thumb-friendly than top tabs on mobile)
- Horizontal scrolling for tables rather than hiding all columns
- Stacked forms for filter controls on mobile
- No category details panel on mobile (users tap category rows)

### Testing Checklist
- [ ] PWA manifest loads correctly
- [ ] "Add to Homescreen" works on iOS Safari
- [ ] "Add to Homescreen" works on Android Chrome
- [ ] App icon appears on homescreen
- [ ] Dashboard renders correctly on phone
- [ ] Transactions page is usable on phone
- [ ] Bottom nav is accessible
- [ ] Portrait and landscape orientations work
- [ ] Touch targets are large enough (44px minimum)
