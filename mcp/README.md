# MoneyWise MCP connector

Gives Claude desktop access to MoneyWise, so it can read **and change** the **live**
data. The tools themselves run inside the production app on Fly
(`backend/src/mcp/`). This folder only holds a small bridge, `bridge.js`. Claude
desktop starts the bridge inside WSL, and it forwards each tool call to
`https://moneywise.fly.dev/mcp` with a secret token.

It works only from Claude desktop on this PC, not from claude.ai on the web or the
phone. A connector for those needs OAuth; see `FUTURE_WORK.md`.

## Tools

Every tool is separate, so Claude desktop asks for approval per tool, and it can
remember "always allow" per tool. Where the per-tool settings live depends on your
Claude desktop version: look under **Settings → Connectors** (or Developer). The
"Suggested" column is only a suggestion.

| Tool | What it does | Suggested |
|---|---|---|
| `get_financial_snapshot` | The whole database in one result: accounts with balances, envelopes, every transaction and envelope transfer, Ready to Assign, and the current month's dashboard. | Always allow |
| `query_moneywise` | One read-only SQL query, max 500 rows. | Always allow |
| `preview_moneywise_write` | A dry run of any write below. It shows the rows that would change and the balances before → after, then rolls everything back. | Always allow |
| `add_moneywise_transaction` | Add a transaction. With no date it is pending. A likely duplicate is refused. | Ask |
| `settle_moneywise_transactions` | Settle pending rows (a row with no date gets today's date). Rows that are already settled are skipped. | Ask |
| `move_moneywise_envelope_money` | Move money between envelopes, or to and from Ready to Assign. | Ask |
| `record_moneywise_account_transfer` | Record a move between accounts: an Account Transfer row out and a Balance Change row in. Loans are refused. | Ask |
| `recategorize_moneywise_transactions` | Move transactions to another envelope. | Ask |
| `edit_moneywise_transaction` | Change a transaction's memo, account, date, or amount + direction. | Ask |
| `edit_moneywise_envelope_transfer` | Change an envelope transfer. | Ask |
| `delete_moneywise_envelope_transfer` | Delete an envelope transfer. | Ask |
| `create_moneywise_category` | Create an envelope. | Ask |
| `update_moneywise_category` | Rename an envelope, change its target, or hide/unhide it. | Ask |
| `delete_moneywise_category` | Delete an envelope that has no rows. | Ask or Block |
| `undo_moneywise_write` | Reverse an earlier write, by its `write_id`. | Ask |

Not supported: deleting transactions, funding the month, changing accounts, and
loan payments. Do those in the web app.

## How a write works

1. You ask Claude for something, for example "move $40 from Dining Out to Kids".
2. Claude calls `preview_moneywise_write` and shows you what would change.
3. You say yes in chat. Claude calls the real tool, and Claude desktop shows its
   approval prompt.
4. The server then:
   - backs up the database to `/data/backups/moneywise_premcp_<time>.db` on Fly
     (kept for 7 days, like the 6-hourly backups);
   - makes the change in one transaction;
   - logs it in the `mcp_writes` table, with the full before/after rows;
   - returns the `write_id`.
5. `undo_moneywise_write` with that id puts the rows back. It refuses if a row has
   changed since, for example because you edited it in the web app.

To see what Claude has written, ask it to query `mcp_writes`.

## Setup (one-time)

1. Install the bridge's dependencies:
   ```bash
   cd mcp && npm install
   ```
2. Set the token. It goes in two places, and both must hold the same value:
   ```bash
   TOKEN=$(openssl rand -hex 32)
   fly secrets set MCP_TOKEN=$TOKEN           # restarts the app once
   cp mcp/.env.example mcp/.env && sed -i "s/^MCP_TOKEN=.*/MCP_TOKEN=$TOKEN/" mcp/.env
   ```
   `mcp/.env` is gitignored. Anyone who has the token can write to the live data.
3. Add the bridge to Claude desktop. Go to **Settings → Developer → Edit Config**,
   then add an `mcpServers` entry at the top level of `claude_desktop_config.json`.
   (This is the same entry the old read-only connector used.)
   ```json
   "mcpServers": {
     "moneywise": {
       "command": "C:\\Windows\\System32\\wsl.exe",
       "args": ["-d", "Ubuntu", "-e", "/home/sudarshan/moneywise/mcp/run.sh"]
     }
   }
   ```
4. Fully quit Claude desktop (from the system tray, not just closing the window) and
   reopen it. Then check which per-tool permission settings it offers.

## Testing without touching production

Run a backend on a copy of the database, then point the bridge at it:

```bash
sqlite3 data/moneywise.db ".backup '/tmp/test.db'"
cd backend && DB_PATH=/tmp/test.db BACKUP_DIR=/tmp/bk MCP_TOKEN=test PORT=3001 node src/index.js
# in another shell
MCP_TOKEN=test MONEYWISE_MCP_URL=http://localhost:3001/mcp node mcp/bridge.js
```

The variable is `DB_PATH`, not `DATABASE_PATH`. With the wrong name, the server
uses the real `data/moneywise.db`.

## Notes

- `run.sh` loads Node through nvm and reads `mcp/.env`.
- stdout is the MCP protocol channel; the bridge logs to stderr only.
- The bridge connects to Fly only when the first tool request arrives. If Fly is
  asleep, the first call takes a few seconds while the VM wakes. If Fly can't be
  reached, the tool returns an error that says so.
- The dashboard and Ready to Assign figures come from
  `backend/src/services/budgetMath.js`, the same code the app runs.
