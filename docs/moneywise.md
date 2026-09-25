# MoneyWise

*A reference for anyone — person or AI agent — who needs to understand Sudarshan's
personal finance app and the data in it. Written September 25, 2026.*

---

## 1. What MoneyWise is

MoneyWise is Sudarshan's personal, self-hosted **envelope budgeting** app. It is
used by one person (Sudarshan, US-based; all amounts are **USD**) to plan and track
household spending.

Envelope budgeting means every dollar of spendable money is assigned to a purpose
**before** it is spent. Each purpose is an *envelope* (MoneyWise calls them
**categories**): Groceries, Electric Bill, Kids, and so on. Spending draws down an
envelope. When an envelope runs out, money has to be moved into it from another
envelope or from the pool of unassigned money, which is called **Ready to Assign**.

The question MoneyWise answers day to day is not "how much is in my checking
account?" but **"how much am I still allowed to spend on groceries this month?"**

## 2. Why it exists

Sudarshan wanted envelope budgeting that works the way he actually manages money,
on data he controls:

- **Private and self-owned.** The data lives in a SQLite database on his own server,
  not in a third-party budgeting service.
- **Built around his workflow.** Monthly funding of envelopes, pending card charges
  entered before they settle, covering overspends from other envelopes, and a
  credit card used as the main spending vehicle.
- **Honest numbers.** Much of the development effort has gone into making the
  envelope math exactly right (see §5).

Transactions are **entered manually** in the app. There are no bank feeds or Plaid
import in MoneyWise itself. That is deliberate — entering each transaction is part
of the budgeting habit — but it means MoneyWise is only as current as the last
entry (see §7.13).

## 3. How it was built

- **Timeline.** Started November 2025. Real data begins **January 1, 2026**, when
  starting balances were entered. Built iteratively with Claude Code as a coding
  partner.
- **Milestones:**
  - Nov 2025 – Jan 2026: accounts, categories, transactions, pending transactions,
    the dashboard, and envelope transfers.
  - Feb 2026: one-click monthly envelope funding ("Fund Categories").
  - July 2026: correctness pass. The credit card was made on-budget, "Available to
    Budget" was renamed "Ready to Assign" in the UI, and a stale carried-forward bug
    was fixed (balances are now always derived live from history).
  - August 2026: the old Reports tab was replaced by a **Deficits** page focused on
    overspending.
  - September 2026: an in-app AI chat was prototyped and removed. Sudarshan prefers
    to do analysis in Claude desktop instead, with MoneyWise data supplied as context.
- **Stack.** React + Vite frontend, Node.js/Express backend, SQLite database (WAL
  mode).
- **Hosting.** Production runs on **Fly.io** at `moneywise.fly.dev`, password
  protected: a single small VM with a persistent volume, which sleeps when idle and
  wakes on the first request. The server backs up the database every 6 hours.
- **Local copy.** Development happens on Sudarshan's Windows PC under WSL. A script
  (`sync-db.sh`) downloads the production database to the PC. **The live data is
  on Fly; the PC has a copy that is as fresh as the last sync.**

## 4. What it tracks

### Accounts (where money physically is)

Each account has a **type** and an **on-budget flag** (`in_moneypot`). Only
on-budget accounts fund envelopes. Setup as of Sept 2026:

| Account | Type | On-budget? | Notes |
|---|---|---|---|
| 360 Checking | bank | yes | Main checking; paychecks land here |
| RH Savings | bank | yes | Robinhood savings (cash) |
| HSA | bank | yes | HSA cash portion |
| CO Venture | credit_card | **yes** | The main spending card; almost all envelope spending goes through it |
| RH Investment | investment | no | Robinhood brokerage |
| RH Agent | investment | no | Robinhood account used for agentic trading |
| HSA Investment | investment | no | Invested portion of the HSA |
| RH Roth Savings | retirement | no | |
| RH Roth Investment | retirement | no | |
| 401(k) | retirement | no | |
| Mortgage | loan | no | Balance stored as a negative number |
| Nissan Leaf | loan | no | Car loan; negative balance |
| Ambuja's Loan | loan | no | **Hidden** in the UI |

On the Dashboard, assets are bank, cash, investment and retirement accounts;
liabilities are credit cards and loans.

### Categories (envelopes)

Each category has a **monthly target** (`monthly_amount`). Targets as of Sept 2026:

**Budgeted monthly (target > 0), 14 envelopes totalling $3,627.69/month:**
Groceries $1,100 · Education $900 · Household $300 · HOA $268 · Electric Bill $200 ·
Cell Phone $155 · Kids $150 · Gym $110 · Dining Out $100 · Natural Gas $100 ·
Water $100 · Internet $75 · Pest Control $39.69 · Gasoline $30

**Funded on demand (target = 0):** Anitha, Vishnu, Auto Maintenance, Home
Maintenance, Insurance, Invest, Medical, Misc, Sports, and Kovil (hidden). Anitha
and Vishnu are per-person envelopes; ask Sudarshan if their purpose matters.

**System categories (internal plumbing, not spending):**
- **Available to Budget** — the unassigned pool, shown in the UI as **Ready to Assign**.
- **Account Transfer** — moving money between accounts (card payments, loan
  payments, moving cash to Robinhood).
- **Balance Change** — adjusting an account to its true balance. Includes
  paychecks, starting balances, investment revaluations and refunds (§7.2).

### Declared income

A single setting: **$10,186.04 per month**. That is Sudarshan's take-home pay (it was
about $9,912 in Jan–Mar 2026). Paychecks arrive in 360 Checking around the 24th–26th
of each month with the memo `Income` (once `Salary`).

### The app's pages

- **Dashboard** — every envelope's available balance for the current month, plus
  accounts split into assets and liabilities, with pending charges shown.
- **Transactions** — the ledger, with filters (account, category, status, dates,
  memo search). By default it shows transactions since the last reconciliation point.
- **Transfers** — envelope-to-envelope moves, and the monthly **Fund Categories**
  button.
- **Deficits** — overspending history: a category-by-month heatmap and per-month
  "case files" showing which envelopes went negative, why, and how they were covered.
- **Configuration** — accounts, categories, targets, income, backups.

## 5. How the money math works

### The one identity

```
sum of on-budget account balances  =  sum of all envelope balances  +  Ready to Assign
```

Every number in MoneyWise follows from this. Money is **fungible** across on-budget
accounts: an envelope is backed by the whole on-budget pool, not by any one account.
(The Medical envelope does **not** need to match the HSA balance; that mismatch is
known and intentional.)

### An envelope's balance

```
balance = carried forward from earlier months
        + transfers in this month
        − transfers out this month
        + this month's activity (spending is negative; pending charges included)
```

Carried-forward is always recomputed from full history, never stored. It can be
**negative**: a deficit that rolled over from a past month.

### Monthly funding is a TOP-UP

Early each month, Sudarshan presses **Fund Categories**. For each budgeted envelope
it creates a transfer from Ready to Assign with the memo **`Auto Funded`**, for
exactly the amount that brings the envelope back up to its target:

```
Auto Funded amount = monthly_amount − current envelope balance
```

Consequences:
- If an envelope had money left over, its Auto Funded amount is **smaller** than the
  target. Example: in August 2026 Kids carried over $105.26, so it was funded
  $44.74, making $150.
- If an envelope ended last month negative, the Auto Funded amount is **larger**
  than the target; it absorbs the deficit.
- Budgeted envelopes therefore **reset to their target** each month. Underspending
  does not pile up; it just lowers next month's funding.

Months funded this way: Feb–May and Jul–Sep 2026. **January and June 2026 were
funded manually**, so those months have no `Auto Funded` transfers.

### Ready to Assign

On-budget money not yet assigned to any envelope. A paycheck raises it; funding
envelopes lowers it.

**It can be negative, and that is an allocation signal, not a spending alarm.** It
means envelopes collectively claim more money than the on-budget accounts hold.
Usually this is because money was moved off-budget (invested) without shrinking the
envelope that held it, or because envelopes are partly backed by the next paycheck.
Permission to spend always comes from the envelope's own balance.

### Why the credit card is on-budget

A card swipe takes money out of an envelope immediately, but cash only leaves the
bank when the bill is paid. With the card counted as on-budget (its balance is
negative), a swipe lowers the pool the same way a debit purchase does, and paying
the bill is a wash. Before July 2026 the card was off-budget, which made every swipe
inflate Ready to Assign.

### Pending transactions

Charges that haven't cleared are entered with `status = pending` and **no date**
(`date` is empty). They count as **current-month** activity and appear on the
Dashboard immediately. When one settles, it gets the settlement date.

### Deficits

A deficit is an envelope going **below zero**. MoneyWise treats it as an event
*within* a month, not only as the end-of-month state: an envelope can dip negative
on the 12th and be covered on the 14th.
- **fixed** — dipped below zero during the month but ended at zero or above.
- **carried** — a past month that ended negative.
- **open** — the current month is negative, counting pending charges.

Covering a deficit means transferring money in from another envelope or from Ready
to Assign. The Deficits page's "Fix now" button writes memos like
`Cover Groceries deficit (Aug 2026)`. Envelopes funded on demand (target 0) are
expected to dip and be covered, so they count as a deficit only if a month *ends*
negative.

## 6. The data model (for querying)

SQLite. Main tables:

| Table | What a row is | Key columns |
|---|---|---|
| `transactions` | One money movement on one account | `date` (NULL if pending), `amount` (negative = money out), `account_id`, `category_id`, `memo`, `status` (`settled`/`pending`), `is_reconciliation_point` |
| `category_transfers` | Money moved between envelopes | `date`, `from_category_id`, `to_category_id`, `amount` (always positive), `memo` (`Auto Funded` = monthly funding) |
| `categories` | An envelope | `name`, `monthly_amount` (current target only, no history), `is_system`, `is_hidden` |
| `accounts` | A real-world account | `name`, `type`, `in_moneypot` (1 = on-budget), `is_hidden` |
| `app_settings` | Key/value settings | `monthly_income`, `last_fund_date` |

- **Account balance** = sum of that account's settled transactions (pending shown
  separately).
- **Envelope-to-Ready-to-Assign moves** use the `Available to Budget` system
  category as the from/to side.
- **Scale** (Sept 25, 2026): ~806 transactions, ~216 envelope transfers, 27
  categories, 13 accounts. The whole database is small (~300 KB).
- **Recording habits:**
  - Account-to-account moves are recorded as **two transactions** in the
    `Account Transfer` category, one on each account (e.g. `To RH` / `From 360`).
    They are not linked by an ID.
  - Card payments appear either as `CO Bill` account transfers or as blank-memo
    `Balance Change` entries on CO Venture.
  - Reconciliation points mark dates when balances were checked against the real
    accounts; the latest is Aug 15, 2026.

## 7. What an agent must know before analyzing this data

These are the traps. Each one produces confidently wrong answers if ignored.

1. **Income is not categorized. Never sum positive transactions and call it income.**
   Positive amounts are a mix of paychecks, January starting balances (~$148k),
   investment and retirement revaluations, card and loan balance adjustments,
   refunds, HSA reimbursements, and cash gifts. Summing them overstates income 3–4×.
   Use the declared **$10,186.04/month**. For actual paychecks, look for memo
   `Income`/`Salary` into 360 Checking.

2. **`Balance Change` is not spending or income.** It is an adjustment bucket:
   bringing accounts to their true balance (investment gains and losses, loan
   principal changes, some card payments), starting balances, paychecks, and
   refunds. Exclude it from spending analysis.

3. **What was budgeted for a past month = that month's `Auto Funded` transfers,
   never `monthly_amount`.** `monthly_amount` is only today's target, and Auto Funded
   is a top-up that depends on the leftover (§5). January and June 2026 were funded
   manually and have no `Auto Funded` rows. For "what was the plan" in a month,
   the effective budget is roughly *carried forward + Auto Funded* (≈ the target at
   the time).

4. **On-budget is `in_moneypot = 1`, not account type.** CO Venture is a credit card
   and **is** on-budget.

5. **Negative Ready to Assign means over-allocation, not overspending** (§5). Don't
   describe it as "you're in the red" or "stop spending".

6. **Pending rows have no date** and belong to the current month. Include them in
   current-month totals, which is what the Dashboard does.

7. **Account transfers are not spending.** Paying the card, paying the mortgage or
   car loan, and moving cash to Robinhood are all `Account Transfer` pairs. Exclude
   them from spending totals, or they double-count.

8. **Invest is savings, not consumption.** Spending in the `Invest` envelope is money
   moved to investment accounts (e.g. $7,191.73 on July 1, 2026). Report it
   separately from lifestyle spending, or it swamps everything else. `Insurance`
   holds large, lumpy payments; call it out separately for the same reason.

9. **Refunds often go to `Balance Change`, not back to the envelope.** Examples:
   "Kroger Refund", "Sam's Club Refund" on the card. So envelope spending is
   typically **gross** of refunds.

10. **Envelopes funded on demand dip and get covered by design.** Misc, Invest,
    Medical, Sports, the per-person envelopes and the like are funded when needed.
    Their going negative mid-month is normal, not overspending.

11. **Categories are not accounts.** Don't expect Medical to equal the HSA, or any
    envelope to match any account.

12. **Net worth includes off-budget accounts, but their values are updated
    periodically by manual `Balance Change` entries, not live.** Investment and
    retirement balances in MoneyWise can lag the market. For live brokerage values,
    Robinhood is the source of truth; MoneyWise's strength is *spending and
    budgeting*, not portfolio value.

13. **Data freshness.** Everything is entered manually, so very recent purchases may
    not be in yet. If something the user mentions is missing, it probably hasn't
    been entered; it is not an error. Real-time bank balances (e.g. via Plaid) can
    differ from MoneyWise because of unentered or pending items.

14. **Hidden items are real.** `Kovil` (category) and `Ambuja's Loan` (account) are
    hidden in the UI but hold real history. Include them in totals; mention them if
    they explain a difference from what the Dashboard shows.

15. **Use "Ready to Assign"** when talking to the user, never "Available to Budget"
    or "MoneyPot".

## 8. How Sudarshan likes the analysis

Preferences stated so far:
- **Neutral analyst tone.** State what the data shows, without softening or
  dramatizing.
- **Diagnose, don't prescribe — unless asked.** Explain what's happening and why;
  give a recommendation when he asks for one.
- **Match length to the question.** A narrow question gets a short answer.
- **Be specific.** Name categories, months and dollar amounts; show where a derived
  number came from so it can be checked. Don't invent descriptions for transactions
  with no memo; refer to them by date, amount and category.
- **USD only.**

## 9. Getting live data

This file describes MoneyWise; it does **not** contain current balances or
transactions. For live numbers, use the MoneyWise connector if one is available in
the conversation. Otherwise, ask Sudarshan for an export or the specific figures.
When a connector provides data, the rules in §7 still apply.
