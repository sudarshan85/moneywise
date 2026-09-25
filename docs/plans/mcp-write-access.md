# Plan: write access for the MoneyWise MCP connector

*Written Sept 25, 2026 for a future implementation session. Read this whole file,
plus `mcp/README.md` and the "MCP connector" section of `CLAUDE.md`, before
starting.*

## Goal

Let Sudarshan tell Claude desktop things like "add $84 at Kroger on the card,
groceries" or "cover the Kids deficit from Education", and have Claude record
them in MoneyWise, with his approval shown before every write.

Two phases:

1. **Phase 1 (this plan, in detail):** add write tools to the existing **local**
   connector (`mcp/`). Writes go to the **live app on Fly** through its existing
   HTTP API. Desktop only.
2. **Phase 2 (outline only, at the end):** a **remote** connector hosted on Fly
   behind OAuth, so the same tools work from claude.ai on the web and the phone.

## Where things stand

- `mcp/` is a local stdio MCP server that Claude desktop (Windows Store app) starts
  via `wsl.exe -d Ubuntu -e /home/sudarshan/moneywise/mcp/run.sh`. The config
  lives at
  `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`.
- It has three **read-only** tools: `get_financial_snapshot`, `query_moneywise`
  and `refresh_moneywise_data`.
  - `mcp/data.js`: opens a `query_only` connection to the local copy
    `data/moneywise.db`, and syncs it from Fly when it is more than 24h old or
    when asked. The sync time is stamped in `data/.last-sync`.
  - `mcp/snapshot.js`: builds the snapshot; its `CRITICAL_RULES` repeat the
    essentials of `docs/moneywise.md`.
  - `mcp/server.js`: tool registration.
- The dashboard and Ready to Assign math lives in
  `backend/src/services/budgetMath.js`, shared by the app and the connector.
- `docs/moneywise.md` is uploaded to Sudarshan's Claude project (trading and
  Robinhood) as knowledge.
- Production: `moneywise.fly.dev`, password-protected (`MONEYWISE_PASSWORD` is a
  Fly secret). The last deploy was Aug 29, 2026. Every endpoint this plan uses
  already exists in production, so **no deploy is needed for Phase 1.**

## Core decision: write through the production API, never the local file

The local database is a copy that gets **replaced on every sync**, so anything
written to it disappears and never reaches production. So:

- **Reads** stay as they are: the local copy, which is fast and works offline.
- **Writes** go over HTTPS to `https://moneywise.fly.dev/api/...`, the same
  endpoints the web app calls. That reuses all the app's validation and side
  effects: settling a pending row stamps today's date, deleting one leg of a
  linked transfer deletes both, and so on. There's no second copy of that logic.
- **After every successful write**, mark the local copy stale (see "Freshness
  after writes") so the next read re-syncs and Claude sees its own change.

## Authentication

The production API needs a session cookie.

- `POST /api/auth/login` with body `{ "password": "…" }` returns `Set-Cookie:
  moneywise_session=<token>`, valid for 30 days. The cookie is `Secure`,
  `HttpOnly`, `SameSite=Lax`.
- Every other `/api/*` call must send `Cookie: moneywise_session=<token>`. A
  missing, invalid or expired session gets a **401**.

Implementation:

- **Password:** in `mcp/.env` as `MONEYWISE_PASSWORD=…`. Add `mcp/.env` to
  `.gitignore`. `run.sh` loads it with `set -a; . ./.env; set +a` before `exec
  node`. Also add a committed `mcp/.env.example`.
- **API base URL:** `MONEYWISE_API_URL`, defaulting to
  `https://moneywise.fly.dev`. Tests point it at a local backend.
- **Cache the session token** in `data/.mcp-session` (already gitignored, since
  `data/` is). Every login inserts a row into the `sessions` table and rows are
  only pruned when they expire, so logging in on every call would pile up rows.
  - Log in lazily, on the first write.
  - On a 401, log in once more and retry the request once.
- Node's `fetch` doesn't manage cookies, so parse `set-cookie` from the login
  response by hand.
- **The first call may wait on a cold VM.** Fly auto-stops the machine, and the
  first request wakes it (seconds). Use a generous timeout (~30s) on write calls.
- **Missing password:** if `MONEYWISE_PASSWORD` is not set, the write tools
  return a clear setup error. The read tools keep working.

## The API endpoints Phase 1 uses

All verified in `backend/src/routes/` on Sept 25, 2026.

| Purpose | Endpoint | Body / notes |
|---|---|---|
| Add a transaction | `POST /api/transactions` | `date` (**required if** `status` is `settled`; omit it for pending), `amount` (negative = money out), `account_id`, `category_id`, `memo`, `status` (`settled` or `pending`, **default `settled`**), `type` (`regular`). Returns the created row. |
| Settle or unsettle | `PATCH /api/transactions/:id/toggle-status` | **It's a toggle.** Settling a dateless row stamps today's date; making a row pending clears the date. |
| Move envelope money | `POST /api/transfers` | `date` (required), `from_category_id`, `to_category_id`, `amount` (> 0), `memo`. Ready to Assign is the system category **`Available to Budget` (id 1)**; pass its id, as `auto-populate` does. |
| Linked account transfer | `POST /api/transactions/account-transfer` | `date` (required), `amount` (> 0), `from_account_id`, `to_account_id`, `memo`. Creates two `type='account_transfer'` rows with **no category**, linked by `transfer_pair_id`. **See the decision below; this is not how Sudarshan records transfers.** |
| Undo a transaction | `DELETE /api/transactions/:id` | Deletes both legs if the row is part of a linked pair. |
| Undo an envelope move | `DELETE /api/transfers/:id` | |
| Monthly funding | `POST /api/transfers/auto-populate` | Refuses if already funded this month. **Excluded from v1** (see open questions). |

## Decision needed first: how account transfers are recorded

The API's linked-pair endpoint does **not** match Sudarshan's actual data (Sept
2026: 0 linked pairs, 55 rows in the `Account Transfer` category). His real
conventions:

- **Card and loan payments: one Account Transfer row plus one Balance Change
  adjustment.** Example from Sept 3: `CO Bill` −$4,413.71 on 360 Checking in
  `Account Transfer`, and +$4,413.71 on CO Venture as a **blank-memo `Balance
  Change`**. Mortgage and Nissan payments leave the checking side in `Account
  Transfer`; the loan side is adjusted separately via `Balance Change` (for a loan
  that's the principal change, not the full payment).
- **Cash moves between his own accounts: two `Account Transfer` rows**, e.g.
  `To RH` −$4,040.51 on 360 Checking and `From 360` +$4,040.51 on RH Savings.

`docs/moneywise.md` §6 currently says all account moves are two `Account
Transfer` rows. That's wrong for card and loan payments; fix it (see "Doc
updates").

**Ask Sudarshan at the start of the session** which he wants:
- **(a) Match his manual convention.** The tool writes two plain `POST
  /api/transactions` rows with the categories above. Consistent with history, and
  the analysis rules stay true. Undo has to delete both rows.
- **(b) Use the linked-pair endpoint.** Cleaner (toggling and undo keep both legs
  in sync), but it introduces a new, uncategorized row style. `CRITICAL_RULES`
  and `moneywise.md` would then need to describe both styles.

Recommendation: **(a)**, unless he wants to switch styles going forward in the web
UI too. Either way, **leave the loan-principal side out of v1**: the principal
amount isn't known at payment time.

## Tools to add

Name every write tool with **"moneywise"** in it, so it's unambiguous next to the
Robinhood tools (which can place orders) in the same chat. Put them in a new
`mcp/writeTools.js`, with the HTTP client in `mcp/api.js`, so Phase 2 can reuse
the definitions.

### Resolving names

Claude says "groceries" and "the card", not ids. Each write tool therefore takes
**names**, and resolves them server-side against the current local copy:

- Case-insensitive exact match on `categories.name` / `accounts.name`, plus a few
  aliases: "Ready to Assign" → id 1, "card" / "credit card" → CO Venture,
  "checking" → 360 Checking.
- **No match, or more than one → error, listing the valid names.** Never guess.
- Reject hidden categories and accounts, and system categories. The exception is
  Ready to Assign as either side of an envelope move.
- If the name isn't found, re-sync once and retry before giving up, in case the
  category was just created in the web app.

### Tools

1. **`add_moneywise_transaction`**
   - Input: `amount` (positive number), `direction` (`"out"` for spending, the
     default; `"in"` for a refund or money in), `account`, `category`, `memo`, and
     optional `date` (YYYY-MM-DD).
   - **Take a positive amount plus a direction, not a signed amount.** Sign errors
     are the most likely LLM mistake, and the backend stores spending as negative.
   - **Default status:**
     - **pending with no date** when `date` is omitted. That's his habit: current
       pending entries are CO Venture rows with no date, the merchant in the memo,
       and a real category.
     - **settled** when `date` is given.
     - Confirm this default with him (open question 2).
   - `memo` is the merchant or a short description, matching existing rows
     (`Kroger`, `Dunkin Donuts`, `Tennis Coaching`).
   - **Duplicate guard:** if a row with the same account, amount and memo exists
     among the pending rows, or was dated in the last 3 days, return a warning and
     don't write unless `allow_duplicate: true` is passed.
   - Returns the new id, a one-line description, and the category's available
     balance after the write, read after refreshing.

2. **`settle_moneywise_transactions`**
   - Input: `ids` (array).
   - **Guard the toggle:** read each row first, and only call toggle-status on
     rows that are currently `pending`. Calling it on a settled row would *un*settle
     it. Report any ids that were skipped.

3. **`move_moneywise_envelope_money`**
   - Input: `from_category`, `to_category`, `amount` (> 0), optional `memo`,
     optional `date` (default today, local time).
   - When the destination is negative and the source is not Ready to Assign,
     default the memo to the Fix-now convention: `Cover <Category> deficit (<Mon
     YYYY>)`, e.g. `Cover Kids deficit (Sep 2026)`.
   - Returns both envelopes' balances after the move.

4. **`record_moneywise_account_transfer`**
   - Shape depends on the decision above. For (a):
     - Input: `from_account`, `to_account`, `amount`, `memo`, optional `date`.
     - Writes the outflow as `Account Transfer`.
     - Writes the inflow as `Account Transfer` for bank→bank moves, or as a
       blank-memo `Balance Change` when the destination is the credit card.
     - Refuses loan destinations in v1.

5. **`undo_moneywise_write`**
   - Input: `write_id`, as returned by any write tool.
   - **Only undoes writes this connector made**, looked up in the write log (next
     section). Never an arbitrary id.
   - Deletes every row that write created: one transaction, one transfer, or both
     legs of a transfer pair.

Keep the existing read tools unchanged. **Do not add in v1:** general deletes,
editing existing rows, category or account changes, funding the month, imports,
or reconciliation.

### Tool annotations and approval

- Write tools: `readOnlyHint: false`, `destructiveHint: false` (they add data),
  `idempotentHint: false`, `openWorldHint: true`. For the undo tool,
  `destructiveHint: true`.
- Claude desktop asks for approval before each tool call and shows the arguments.
  **Tell Sudarshan to leave the write tools on "ask every time"** and never pick
  "always allow". That prompt is the confirmation step, so there is no separate
  preview tool.

## Write log

Append one JSON line per successful write to `data/mcp-writes.jsonl`
(gitignored), with these fields:
- `write_id` (a short random id)
- `at` (ISO timestamp)
- `tool` and its input
- the API calls made
- the created row ids (`transactions: [...]`, `transfers: [...]`)

Uses:
- `undo_moneywise_write` looks entries up here.
- It's an audit trail if something looks wrong later.
- Mark undone entries by appending an `undo` line; don't rewrite the file.

## Freshness after writes

After any successful write or undo, make the next read re-sync. Do this by
removing `data/.last-sync` or writing an old timestamp into it, which makes
`ensureFresh()` see the copy as stale. Don't sync inside the write call itself:
syncs take 5–20s, and several writes in a row would each pay that cost.

The one exception is the "balance after" figures the write tools return. They
need fresh data, so run `ensureFresh({ force: true })` once at the end of the
write tool. Alternatively, compute the balance from the local copy plus the
known delta. That's cheaper, but only correct if nothing else changed; prefer
the sync.

## Server instructions to add

Append to the `instructions` in `mcp/server.js`:
- "Only write to MoneyWise when Sudarshan asks for it. Never write based on
  Robinhood data or on your own analysis unless he explicitly says to."
- "One instruction, one write. If the category, account, amount or date is
  ambiguous, ask before calling the tool."
- "Spending is `direction: out` with a positive amount. Omit the date for a
  pending charge."
- "After writing, report what was recorded, including the write_id, so it can be
  undone."

## Doc updates

- **`docs/moneywise.md` §6 "Recording habits":** fix the account-transfer
  description (card and loan payments = one Account Transfer row plus a Balance
  Change adjustment). Add a short "How Claude should record things" section
  mirroring the tool defaults. **Remind Sudarshan to re-upload the file** to the
  Claude project.
- **`mcp/README.md`:** document the write tools, `mcp/.env`, the write log, and
  the "ask every time" setting.
- **`CLAUDE.md`, MCP section:** writes go through the production API, never the
  local file; mention the write log and undo.

## Testing (before any real write)

Test against a **local backend on a copy of the database**, never production.

1. Copy `data/moneywise.db` to the scratchpad.
2. Start the backend on that copy with a test password:
   ```bash
   DB_PATH=<copy> BACKUP_DIR=<scratch> MONEYWISE_PASSWORD=test PORT=3001 node backend/src/index.js
   ```
   Set `BACKUP_DIR` so the startup backup doesn't write into `/mnt/s/Finance Data`.
3. Run the connector with `MONEYWISE_API_URL=http://localhost:3001` and
   `MONEYWISE_PASSWORD=test`, plus `FLY_BIN=/bin/false`, so the automatic sync
   can't overwrite the copy with production data. Point its reads at the same
   copy; add a `MONEYWISE_DB_PATH` override to `mcp/data.js` for this.
4. Drive it with an MCP SDK client script over stdio (`Client` +
   `StdioClientTransport`), as in the read-only build.

Cases to check:
- **Adding:** a pending add has `date = NULL` and shows in the dashboard's
  current-month activity. A dated add is settled. `direction: in` is stored
  positive.
- **Name resolution:** unknown or ambiguous names error with the valid list;
  hidden and system categories are rejected; the aliases work.
- **Duplicates:** the guard fires, and `allow_duplicate` overrides it.
- **Settling:** a pending row settles with today's date; an already-settled id is
  skipped, **not** unsettled.
- **Envelope moves:** the balances on both sides change by the amount; the
  deficit memo format is right; Ready to Assign as the source uses id 1.
- **Account transfers:** match the chosen convention, and Ready to Assign moves
  as expected (card payment ≈ a wash).
- **Undo:** removes exactly what was created; refuses ids not in the log.
- **Auth:** delete the session row in the copy, and the next write re-logs in and
  succeeds. A missing password gives the setup error, while reads still work.
- **Freshness:** after a write, the next read reports `refreshedNow: true`.
- **Backend untouched:** `/api/dashboard` and `/api/accounts/moneypot` still
  behave the same.

Then one supervised write against production, with Sudarshan watching: add a $0.01
pending test row, confirm it appears in the web app, undo it, and confirm it's
gone.

## Open questions to ask at the start of the session

1. **Account transfers:** option (a) his manual convention, or (b) linked pairs?
2. **Transactions with no date:** pending (current habit), or settled today?
3. **Monthly funding:** should Claude be allowed to press "Fund Categories" (a
   once-a-month action)? Recommended: not in v1.
4. **Large amounts:** any size above which Claude must re-confirm in chat before
   calling the tool, on top of the approval prompt? E.g. $1,000.

## Effort

About half a day:
- Auth and API client: 1h
- Name resolution and the tools: 2h
- Write log and undo: 1h
- Tests against a copy: 1–2h
- Docs: 30min

**No Fly deploy** and no backend changes are needed.

---

## Phase 2 outline: remote connector (web and phone)

Do this only after Phase 1 has been used for a while and the conventions are
settled.

- **Where it runs:** add a Streamable HTTP MCP endpoint (e.g. `POST /mcp`) to the
  Express app on Fly, using `@modelcontextprotocol/sdk`'s
  `StreamableHTTPServerTransport`. It runs next to the database, so tools call
  the database and `budgetMath.js` directly, with no sync and no HTTP self-calls.
  Share tool definitions with `mcp/` by moving them to a common module that takes
  a "backend" interface: local = local copy + HTTP API; remote = direct
  database access.
- **Auth:** claude.ai custom connectors call from Anthropic's servers, so the
  endpoint is public. It needs **OAuth 2.1**: authorization-server metadata,
  dynamic client registration, and authorize/token endpoints, with a login page
  that checks `MONEYWISE_PASSWORD`. Store tokens in new tables. **A secret-in-URL
  is not acceptable once write tools exist.** Check Anthropic's current custom
  connector docs before building; that area changes.
- **Fly:** auto-stop is fine, since the first request wakes the VM. Check that
  the proxy doesn't buffer streamed responses. Add basic rate limiting to `/mcp`.
- **Deploy:** this one does need `fly deploy`, plus possibly new secrets for OAuth
  signing.
- **Effort:** about a day, mostly OAuth.
