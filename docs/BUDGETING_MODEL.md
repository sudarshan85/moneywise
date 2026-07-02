# Budgeting Model & Debugging Guide

How MoneyWise's envelope math works, and how to debug the two numbers that
have caused confusion: **Available to Budget (ATB)** and per-category
**carried-forward**. Read this before "fixing" either — most apparent bugs are
either data-entry choices or the consequences of the identity below.

## The one identity that governs everything

```
on-budget account balances  =  sum of all envelope (category) balances  +  Available to Budget
```

- **on-budget accounts** = spendable accounts you budget from: `type IN ('bank','cash')`.
  Investment, retirement, credit-card and loan accounts are **off-budget**.
- **envelope balance** (per category) = transfers in − transfers out + settled spending
  (spending is stored negative). Money is **fungible** across on-budget accounts — an
  envelope is *not* tied to any one account.
- **ATB** = on-budget cash that hasn't been assigned to an envelope yet.

Computed in [`backend/src/routes/accounts.js`](../backend/src/routes/accounts.js) (`GET /api/accounts/moneypot`):
`ATB = SUM(on-budget account settled balances) − totalCategoryBalance`.

### Categories are not accounts

The most common confusion. "Medical" (a category) does not need to equal "HSA" (an
account). The Medical envelope is backed by your *whole* on-budget pool, not by the
HSA account specifically. It's fine (and normal) for an envelope's balance to differ
from any single account's balance.

## Why ATB goes negative (and how to debug it)

ATB goes negative when **envelopes claim more money than your on-budget accounts hold**.
The usual root cause: **budgeted money got moved off-budget (invested) without reducing
the envelope that was holding it.**

When you invest, on-budget cash leaves (an account transfer to an investment/retirement
account), which lowers ATB. If the corresponding envelope isn't also reduced, the
envelopes stay high while the backing pool shrinks → ATB drops, eventually negative.

**Rule of thumb: when you invest money an envelope was holding, shrink that envelope too**
(record it as spending from the envelope, or transfer it back to ATB).

### Debugging checklist

1. Compare the two sides of the identity:
   - on-budget total: `SUM(settled balance) WHERE type IN ('bank','cash') AND is_hidden=0`
   - envelope total: `transfersFromATB − transfersToATB + settled spending in user categories`
2. List each envelope balance (transfers in − out + settled spending). Look for one that's
   surprisingly large — often a **sign error** on an "invest"-style transaction (a `+` that
   should be `−`), which inflates the envelope and drags ATB down.
3. Check recent account transfers into investment/retirement accounts. Each dollar moved
   off-budget lowers ATB dollar-for-dollar; confirm that was intended.
4. Confirm account `type`s are right — a spendable account mis-typed as `investment` would
   wrongly be excluded from on-budget.

## Worked example (July 2026, resolved)

- **Symptom:** ATB showed −$10,262.58.
- **Cause 1 (formula):** ~$7k of budgeted savings was moved from RH Savings (bank) into a
  Roth (retirement, off-budget), correctly lowering ATB.
- **Cause 2 (data-entry sign error):** a July "Invest" transaction was entered `+$7,191.73`
  instead of `−$7,191.73`, inflating the Invest envelope to ~$14,383 (should be ~$0).
- **Fix:** corrected the sign (and recategorized the paired entry) → Invest envelope ~$0,
  envelopes dropped to $21,307.06, ATB became +$4,120.88. No code change was needed for
  this part; it was data.

### HSA / Medical (intentionally left as-is)

Medical envelope ≈ $4,558 while liquid HSA cash ≈ $1,946 (the other ~$3,201 is in HSA
Investment, off-budget). This is **not an error** — Medical is backed by the whole
on-budget pool, and the invested $3,201 already correctly reduced ATB when it was
transferred. Reducing Medical → ATB is an optional *preference* ("reserve less for
medical"), not a correction, and it would not make Medical equal the HSA balance.
Decision: **ignore it.** If ATB goes negative in future, revisit using the checklist above.

## Related: carried-forward (dashboard cards)

Per-category carried-forward is **derived live** (never a cached snapshot) in
[`backend/src/routes/dashboard.js`](../backend/src/routes/dashboard.js) —
`computeCarriedForward()` sums transfers in/out + settled transactions dated *before* the
month. It self-corrects when past transactions are edited. Pending transactions are
excluded from carried-forward (they're counted as current-month activity) to avoid
double-counting. This replaced an `INSERT OR IGNORE` snapshot that went stale whenever
past months were edited.
