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
│   │   ├── mcp/         # MCP server for Claude (tools, write engine)
│   │   └── routes/      # API endpoints (transactions, categories, transfers, backup)
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

## Notes
- The Deficits tab (Aug 2026) was removed in Oct 2026; overspending analysis now
  happens in Claude through the MCP connector. Old cover transfers carry memos like
  `Cover Groceries deficit (Aug 2026)`, and the MCP envelope-move tool still writes them.
- `computeCarriedForward` lives in `backend/src/utils/envelope.js` (used by the
  dashboard detail route).
- See `FUTURE_WORK.md` for planned future features.

## MCP connector (Claude desktop)
- The MCP server runs **inside the backend** (`backend/src/mcp/`), mounted at
  `POST /mcp` before the session-cookie auth and guarded by `Authorization: Bearer
  $MCP_TOKEN` (a Fly secret; with it unset the route 404s). It reads and writes the
  **live** database: there is no local copy or sync involved.
- `mcp/` is only a stdio bridge (`bridge.js`) that Claude desktop (Windows) launches
  via `wsl.exe` → `mcp/run.sh`; it forwards tool calls to Fly with the token from
  `mcp/.env`. Setup, tool list and permissions are in `mcp/README.md`.
- Every write goes through `runWrite` (`backend/src/mcp/writes.js`): rows change only
  through its recorder, which keeps before/after images. That gives preview
  (`preview_moneywise_write` = run, measure, roll back), the `mcp_writes` log, undo,
  and a `moneywise_premcp_*` backup before each commit. New write tools go in
  `WRITE_TOOLS` (`writeTools.js`); never write to the DB around the recorder.
- Icons (`backend/src/services/icons.js`): built-in PNGs in `frontend/public/icons`
  plus icons uploaded through MCP (`add_moneywise_icon`) into `UPLOADED_ICONS_DIR`
  (`/data/icons` on the Fly volume; locally an `icons` folder next to the DB). Both
  are served at `/icons/<name>.png` (built-in first) and listed by `GET /api/icons`.
  MCP only accepts existing icons for categories. Render category icons through
  `IconDisplay`, never a raw `<img>`: the column may hold an emoji. `sync-db.sh`
  pulls uploaded icons into the repo so they can be committed.
- Dashboard and Ready to Assign math lives in `backend/src/services/budgetMath.js` as
  pure functions of a connection, shared by the routes and the connector. Change it
  there, not in the routes.
- `docs/moneywise.md` explains the app and the agent traps. It is uploaded to a Claude
  project as knowledge; `backend/src/mcp/rules.js` (`CRITICAL_RULES`, `WRITE_RULES`)
  repeats the essentials. Keep the two in sync.
- The DB path env var is `DB_PATH` (`database.js`); `DATABASE_PATH` is only read by the
  backup scheduler. Test against a copy with `DB_PATH=<copy> BACKUP_DIR=<dir>
  MCP_TOKEN=test node backend/src/index.js` and `MONEYWISE_MCP_URL=http://localhost:3001/mcp`.
