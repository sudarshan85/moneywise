# CLAUDE.md - MoneyWise Project Guide

## Overview
MoneyWise is a personal finance application using an **Envelope Budgeting System**. It consists of a React/Vite frontend and an Express/SQLite backend running in WSL.

## Tech Stack
- **Frontend**: React, Vite, CSS (Vanilla), Lucid Icons (via public/icons)
- **Backend**: Node.js, Express, better-sqlite3
- **Database**: SQLite (`data/moneywise.db`)
- **Environment**: WSL (Windows Subsystem for Linux), Ubuntu

## Project Structure
```text
moneywise/
├── start.sh              # Main launch script (handles backend + frontend)
├── backend/              # Express API server
│   ├── src/
│   │   ├── db/          # Database logic (schema.sql, database.js)
│   │   ├── utils/       # Shared helpers (dates.js — local-time date math)
│   │   └── routes/      # API endpoints (transactions, categories, deficits, backup)
│   ├── package.json
├── frontend/             # React SPA (Single Page Application)
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page views (Transactions, Configuration, etc.)
│   │   ├── stores/      # State management (Zustand)
│   │   ├── App.jsx      # Main layout & routing
│   │   └── index.css    # Global styles & design system
│   ├── public/icons/    # Custom PNG icons & emojis
│   └── package.json
└── data/                 # Database storage (moneywise.db) - *Gitignored*
```

## Key Commands
- **Start App**: `./start.sh` (Starts both servers)
- **Start App (Fresh)**: `./start.sh --fresh` (Deletes DB & starts fresh)
- **Frontend Dev**: `cd frontend && npm run dev`
- **Backend Dev**: `cd backend && npm run dev`
- **Lint**: `npm run lint` (in respective folders)
- **Format**: `npm run format` (in respective folders)
- **View DB**: `sqlite3 data/moneywise.db`

## Architecture & Concepts
- **Budgeting math**: See `docs/BUDGETING_MODEL.md` for the envelope identity
  (`on-budget accounts = envelopes + Ready to Assign`), why it can go negative,
  how carried-forward is derived, and a debugging checklist. Read it before changing
  Ready to Assign or carried-forward logic. The UI says "Ready to Assign" but the
  system category and API route keep their internal names (`Available to Budget`,
  `GET /api/accounts/moneypot`); use `displayCategoryName()` in
  `frontend/src/utils/format.js` when rendering.
- **On-budget accounts** are flagged via `accounts.in_moneypot` (bank, cash, and
  spend-vehicle credit cards) — not hardcoded by type.
- **Database mode**: SQLite runs in WAL. `sync-db.sh` checkpoints the remote WAL
  before copying the file; anything else that raw-copies the DB must do the same.
- **Data Model**:
  - **Transactions**: Core record. Can be `regular`, `account_transfer`, `balance_adjustment`.
  - **Categories**: Envelopes for budgeting. `is_system=1` for special categories (MoneyPot, Transfer).
  - **Accounts**: Sources of funds (Bank, Cash, Credit Card).
- **System Categories**:
  - `MoneyPot`: Holds unallocated funds.
  - `Account Transfer`: Used for transfers between accounts.
  - `Balance Change`: Used for adjustments/reconciliaton.
- **Icons**:
  - Categories/Accounts use either emojis OR custom PNGs from `/frontend/public/icons/`.
  - Stored in DB as string: `"🍔"` or `"/icons/burger.png"`.

## Development workflow
1. **Changes**: Modify frontend/backend source.
2. **Reload**: Vite HMR handles frontend; backend auto-restarts via nodemon.
3. **Icons**: Add new PNGs to `frontend/public/icons/`.
4. **Database**: Schema changes require manual migration or fresh start (`--fresh`).

## Deployment (Fly.io)
- Deploy with: `fly deploy` (run from the repo root — does NOT auto-deploy from GitHub push)
- Fly.io builds the Docker image locally and pushes it to the cluster
- The app runs on port 8080 in production (`ENV PORT=8080` in Dockerfile)
- API URL pattern: relative `/api` in production, `http://localhost:3001/api` in dev (see `frontend/src/api/client.js` line 2)

## Code Style
- **JS**: ES Modules (`import/export`).
- **CSS**: Plain CSS with variables (defined in `index.css`).
- **Styling**: Class-based, avoid inline styles.
- **Naming**: camelCase for vars/funcs, snake_case for DB columns.
- **Error Handling**: Try-catch blocks in async routes; display user-friendly errors in UI.

## Common Tasks
- **Add New Tab**: Update `TABS` and `TAB_CONTENT` in `frontend/src/App.jsx`.
- **Add System Category**: Update `SYSTEM_CATEGORIES` in `backend/src/db/database.js`.
- **Backup**: Use `POST /api/backup/import` or `GET /api/backup/export`.

## Deficits
- The Deficits tab (replaced the old Reports tab in Aug 2026) is entirely about
  overspending: a category×month heatmap (`GET /api/deficits/history`), per-month
  "case file" cards (`GET /api/deficits/month/:yearMonth`), and an inline
  pre-filled "Fix now" transfer for the current month.
- Cell outcomes: **fixed** (envelope dipped below zero during the month but ended
  ≥ 0), **carried** (past month ended negative), **open** (current month negative
  including pending). Deficits are intra-month dips, not just end-of-month state.
- Unbudgeted categories (`monthly_amount = 0`, funded ad hoc — Misc, Invest, …)
  are excluded unless a month ends negative: their intra-month dip-and-cover is
  workflow, not overspending (`countsAsDeficit` in deficits.js).
- Conventions in `backend/src/routes/deficits.js`: "budgeted" = transfers-in with
  memo `'Auto Funded'` (never `categories.monthly_amount`, which has no history);
  a "fix" = any other transfer-in that lands while the running balance is negative.
  An event's date decides its month, but within a month events replay in ENTRY
  order (`created_at`) — rescues are usually recorded while the overspending
  transactions are still pending, so date order would hide the dip, while
  pre-funded planned purchases (transfer entered before the spend) correctly
  never dip. Pending transactions join the CURRENT month's replay as events dated
  today (dashboard parity), so an overspend fixed while the spend is still
  pending shows immediately. Auto-funding that absorbs a carried deficit counts
  as budget, not a fix.
- The "Fix now" flow writes memos like `Cover Groceries deficit (Aug 2026)`.
- `computeCarriedForward` lives in `backend/src/utils/envelope.js` (shared with
  the dashboard); month math helpers in `backend/src/utils/dates.js` and
  `frontend/src/utils/format.js` (`shiftMonth`, `currentYearMonth`).
- See `FUTURE_WORK.md` for planned future features.

## MCP connector (Claude desktop)
- `mcp/` is a local, read-only MCP server that gives Claude desktop (Windows) access to
  MoneyWise data. Claude desktop launches `mcp/run.sh` through `wsl.exe`. It is never
  deployed: the Dockerfile only copies `frontend/` and `backend/`. Setup and tool list
  are in `mcp/README.md`.
- It reads the local copy `data/moneywise.db` and refreshes it from Fly when it is more
  than 24h old (stamp in `data/.last-sync`, also written by `sync-db.sh`), or on request.
- Dashboard and Ready to Assign math lives in `backend/src/services/budgetMath.js` as
  pure functions of a connection, shared by the routes and the connector. Change it
  there, not in the routes.
- `docs/moneywise.md` explains the app and the agent traps. It is uploaded to a Claude
  project as knowledge; the connector's `CRITICAL_RULES` (`mcp/snapshot.js`) repeat the
  essentials. Keep the two in sync.
