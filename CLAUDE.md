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
│   │   ├── db/          # Database logic (schema.sql, database.js, seed.js)
│   │   └── routes/      # API endpoints (transactions, categories, backup)
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
- **Start App (Seed)**: `./start.sh --seed` (Populates sample data)
- **Frontend Dev**: `cd frontend && npm run dev`
- **Backend Dev**: `cd backend && npm run dev`
- **Lint**: `npm run lint` (in respective folders)
- **Format**: `npm run format` (in respective folders)
- **View DB**: `sqlite3 data/moneywise.db`

## Architecture & Concepts
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
