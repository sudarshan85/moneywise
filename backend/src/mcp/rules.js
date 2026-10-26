/**
 * The text Claude reads before using the MoneyWise connector.
 *
 * No imports: the local bridge (mcp/bridge.js) imports this file too, so its
 * fixed instructions match what the server says, even when Fly is unreachable.
 */

// The traps that produce confidently wrong numbers. The full explanation is in
// docs/moneywise.md (uploaded to the Claude project); these repeat the
// essentials so they travel with the data into any chat.
export const CRITICAL_RULES = [
    'Income is NOT categorized. Never sum positive transactions and call it income — they mix paychecks, starting balances, investment revaluations, card/loan balance adjustments and refunds. Use declaredMonthlyIncome; actual paychecks have memo Income or Salary into 360 Checking.',
    "'Balance Change' and 'Account Transfer' are system categories, not spending. A move between accounts (card, mortgage and loan payments, moves to Robinhood) is an 'Account Transfer' row on the paying account plus, usually, a 'Balance Change' row on the receiving one; exclude both from spending totals.",
    "What was budgeted in a month = that month's category_transfers with memo 'Auto Funded' (a top-up to each envelope's target), never categories.monthly_amount, which is only today's target. Jan and Jun 2026 were funded manually.",
    'On-budget accounts are in_moneypot = 1 (the CO Venture credit card is on-budget). Negative Ready to Assign means envelopes are over-allocated, not overspent.',
    'Pending transactions have date = null and count as current-month activity.',
    "Spending in the 'Invest' envelope is money moved to investments (savings), not consumption — report it separately. Refunds usually land in Balance Change, so envelope spending is gross of refunds.",
    'Always say "Ready to Assign", never "Available to Budget".'
];

// How Claude may change data. Repeated (short form) in every write tool's
// description, because a client may show tools without server instructions.
export const WRITE_RULES = [
    'Write only when Sudarshan asks you to. Never write because of Robinhood data or your own analysis unless he explicitly says so.',
    'Before every write, call preview_moneywise_write with the same tool and arguments, show him what would change, and call the write tool only after he says yes in chat.',
    'One instruction, one write. If the category, account, amount or date is ambiguous, ask before previewing.',
    'Spending is direction "out" with a positive amount. Omit the date for a pending card charge.',
    'After a write, tell him the write_id (undo_moneywise_write reverses it) and check the result with query_moneywise.'
];

export const WRITE_RULES_SHORT =
    'Writes to the LIVE MoneyWise database. Only when Sudarshan asks; preview with preview_moneywise_write first and commit only after he confirms.';

export const SERVER_INSTRUCTIONS = [
    "Access to MoneyWise, Sudarshan's personal envelope-budgeting app (USD). All data is live production data.",
    'Start with get_financial_snapshot for any question about his spending, budgets or finances; use query_moneywise for follow-up detail.',
    'If moneywise.md is in the project knowledge, it explains the budgeting model in full. Essential rules:',
    ...CRITICAL_RULES.map(rule => `- ${rule}`),
    'Writing data:',
    ...WRITE_RULES.map(rule => `- ${rule}`)
].join('\n');
