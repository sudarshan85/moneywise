# MoneyWise MCP connector (local)

Gives Claude desktop **read-only** access to MoneyWise data. Runs on this PC only:
Claude desktop starts it inside WSL when needed. It does not work from claude.ai on
the web or on the phone, and nothing about it is deployed to Fly.

## Tools

| Tool | What it does |
|---|---|
| `get_financial_snapshot` | The whole database in one result (~63KB): accounts with balances, envelopes with targets, every transaction and envelope transfer, Ready to Assign, and the current month's dashboard, plus data freshness and the rules for reading it. |
| `query_moneywise` | One read-only SQL query, max 500 rows. |
| `refresh_moneywise_data` | Pull a fresh copy from production now. |

## Freshness

The connector reads `data/moneywise.db`, a copy of production. Before answering,
it refreshes that copy automatically if it is **more than 24 hours old**. To force
a refresh, tell Claude something like "refresh MoneyWise first".

A refresh wakes the Fly VM, checkpoints its WAL, downloads the database to a temp
file, verifies it, then swaps it in (keeping the previous copy as
`data/moneywise.db.mcp-prev`). It takes about 5–20 seconds. If it fails, Claude
still gets the old copy, with a warning that it may be out of date.

The last sync time is in `data/.last-sync`. `sync-db.sh` writes it too.

## Setup (one-time)

```bash
cd mcp && npm install
```

In Claude desktop go to **Settings → Developer → Edit Config**, then add an
`mcpServers` entry at the top level of `claude_desktop_config.json`:

```json
"mcpServers": {
  "moneywise": {
    "command": "C:\\Windows\\System32\\wsl.exe",
    "args": ["-d", "Ubuntu", "-e", "/home/sudarshan/moneywise/mcp/run.sh"]
  }
}
```

Then fully quit Claude desktop (from the system tray, not just closing the window)
and reopen it.

## Notes

- `run.sh` loads Node through nvm and adds `~/.fly/bin` to PATH. The sync uses your
  existing `fly` login in WSL.
- stdout is the MCP protocol channel; the server logs to stderr only.
- The dashboard and Ready to Assign figures come from
  `backend/src/services/budgetMath.js`, the same code the app runs.
- Don't run a refresh while the local dev server (`./start.sh`) has the database
  open; `sync-db.sh` has the same caveat.
