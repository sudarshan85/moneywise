# MoneyWise MCP connector

Gives Claude access to MoneyWise, so it can read **and change** the **live** data.
The tools themselves run inside the production app on Fly (`backend/src/mcp/`), at
`https://moneywise.fly.dev/mcp`. There are two ways in:

- **claude.ai custom connector** (web, phone apps, and Claude desktop): Claude's
  cloud connects to Fly directly, after you sign in once with the MoneyWise
  password (OAuth). The PC doesn't need to be on. See
  [claude.ai and the phone](#claudeai-and-the-phone-oauth).
- **Local bridge** (Claude desktop on this PC only): this folder holds `bridge.js`.
  Claude desktop starts it inside WSL, and it forwards each tool call with a secret
  token (`MCP_TOKEN`). See [Setup](#setup-one-time).

Both reach the same tools and the same `mcp_writes` log.

## Tools

Every tool is separate, so Claude desktop asks for approval per tool, and it can
remember "always allow" per tool. Where the per-tool settings live depends on your
Claude desktop version: look under **Settings → Connectors** (or Developer). The
"Suggested" column is only a suggestion.

| Tool | What it does | Suggested |
|---|---|---|
| `get_financial_snapshot` | The whole database in one result: accounts with balances, envelopes, every transaction and envelope transfer, Ready to Assign, and the current month's dashboard. | Always allow |
| `query_moneywise` | One read-only SQL query, max 500 rows. | Always allow |
| `list_moneywise_icons` | Every icon available for envelopes and accounts, built-in or uploaded. | Always allow |
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
| `add_moneywise_icon` | Upload a new PNG icon (max 64 px, 20 KB) to the live app; usable at once. | Ask |
| `delete_moneywise_icon` | Delete an uploaded icon that nothing uses. | Ask |
| `undo_moneywise_write` | Reverse an earlier write, by its `write_id` (icon uploads use `delete_moneywise_icon` instead). | Ask |

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

## Icons

Envelope icons must be existing icons; `create_moneywise_category` and
`update_moneywise_category` refuse anything else, emoji included. If none fits,
Claude can draw one (32 px, transparent background, flat style, like the rest of
the set), show it to you, and upload it with `add_moneywise_icon`.

- Uploaded icons are saved on the Fly volume in `/data/icons`
  (`UPLOADED_ICONS_DIR`), so they survive deploys, and are served at
  `/icons/<name>.png` next to the built-in ones.
- `./sync-db.sh` copies any uploaded icon you don't have yet into
  `frontend/public/icons/` and prints its name. Commit it to make it a built-in
  icon; the copy left on the volume is harmless.

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

## claude.ai and the phone (OAuth)

The backend is its own OAuth 2.1 server (`backend/src/mcp/oauth.js`, built on the MCP
SDK's auth router). It is on whenever `MONEYWISE_PASSWORD` is set.

### Add the connector (once, in a browser)

1. Open **claude.ai** in a browser (on the PC, or the phone's browser), then
   **Customize → Connectors → + Add → Add custom connector** (on some accounts:
   **Settings → Connectors → Add custom connector**).
2. Name it `MoneyWise`, with URL `https://moneywise.fly.dev/mcp`. If the dialog asks
   about the OAuth client, pick **Register automatically**. Leave the client ID and
   secret empty.
3. Click **Add**, then **Connect**. A MoneyWise page opens:
   - enter the MoneyWise password (the web app's);
   - check that the next page names **Claude**, then click **Allow**.
4. Back in claude.ai, open the connector and set each tool's permission
   (**Always allow / Needs approval / Blocked**), using the table above as a guide.
   These settings are separate from Claude desktop's.

The connector then shows up in the Claude iOS/Android apps on the same account: in a
chat, tap **+ → Connectors** and make sure MoneyWise is on. Free plans allow one
custom connector.

Sessions last as long as you use them. Access tokens expire after 1 hour and Claude
refreshes them by itself. The refresh token rotates on each use and lapses after 90
days without use. Then you click **Connect** again and sign in.

Notes:
- Claude desktop also sees connectors added on claude.ai, so it may show the
  MoneyWise tools twice (bridge and connector). Turn one off in Claude desktop.
- Research mode can call connector tools without asking. Block the write tools
  before using it with MoneyWise.
- If Fly was asleep, the first connect can time out while the machine starts. Try
  again.
- Only `https://claude.ai/api/mcp/auth_callback` is accepted as a redirect URI, so
  no other site can register a client. Five wrong passwords from one IP (or 20 in
  total) within 15 minutes lock the sign-in page for 15 minutes. The web app's own
  login is separate and unaffected.
- Every sign-in, consent and revocation is logged as `[oauth] …` (`fly logs`).

### Revoke access (lost phone)

- **Web app:** Configuration → Settings → **Claude Connector** → **Revoke all
  access**. Every claude.ai connection is signed out at once. The bridge keeps
  working.
- **Command line** (if the web app is unreachable):
  ```bash
  fly ssh console -C "node -e \"new (require('/app/node_modules/better-sqlite3'))('/data/moneywise.db').exec('DELETE FROM oauth_tokens; DELETE FROM oauth_codes; DELETE FROM oauth_consents')\""
  ```
- Changing `MONEYWISE_PASSWORD` does **not** revoke tokens already issued. Revoke
  them as well.

To reconnect afterwards, click **Connect** on the connector in claude.ai and sign in
again.

### What is stored

The tables are `oauth_clients`, `oauth_consents`, `oauth_codes` and `oauth_tokens`,
in `schema.sql`.
- Codes, consent nonces and tokens are stored only as SHA-256 hashes.
- Codes expire after 5 minutes and work once. A reused code also revokes the
  tokens it produced.
- If a client registers as confidential, its `client_secret` is stored as issued,
  because the SDK compares it in plain text. It is useless without a valid code or
  refresh token.

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

To test OAuth locally, also set `MONEYWISE_PASSWORD=<anything>`. The issuer is then
`http://localhost:<PORT>`. Register a client with redirect URI
`https://claude.ai/api/mcp/auth_callback`, and read the code from the `Location`
header of the final `/authorize` response; don't follow the redirect.

## Notes

- `run.sh` loads Node through nvm and reads `mcp/.env`.
- stdout is the MCP protocol channel; the bridge logs to stderr only.
- The bridge connects to Fly only when the first tool request arrives. If Fly is
  asleep, the first call takes a few seconds while the VM wakes. If Fly can't be
  reached, the tool returns an error that says so.
- The dashboard and Ready to Assign figures come from
  `backend/src/services/budgetMath.js`, the same code the app runs.
