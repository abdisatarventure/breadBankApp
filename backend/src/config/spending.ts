// ── Spending / income accounting convention ────────────────────────────────
//
// Every transaction is bucketed by its category name:
//
//   • 'Transfer' → money moving between your OWN accounts (e.g. a credit-card
//     payment). Excluded from both spending and income entirely.
//   • 'Income'   → real income. Its credits are the ONLY thing counted as income.
//   • everything else (including NULL / 'Unknown') → a SPENDING category. A debit
//     adds to that category's spend; a credit is treated as a REFUND /
//     REIMBURSEMENT that REDUCES that category's spend (e.g. a roommate Zelling
//     you their share of rent, or a store refund). It is never income.
//
// These fragments assume the transactions table is aliased `t` and left/inner
// joined to categories as `c`. They contain no user input, so they are safe to
// interpolate into query strings. Keep every spending/income calculation using
// these so the dashboard, reports, budgets and AI all reconcile.

// Rows that count toward spending. Excluded: Transfer and Income; Credit Card
// Payment (the card's purchases are the real spending, so counting the payment
// would double-count); and Savings (moving money into your own savings is not
// spending). These are all money-movement / accounting buckets, not purchases.
export const SPENDING_FILTER = `ISNULL(c.name, '') NOT IN ('Transfer', 'Income', 'Credit Card Payment', 'Savings')`;

// Net spend for a single row: debits add, credit refunds subtract. Use when the
// surrounding query has already restricted rows to spending categories.
export const NET_SPEND = `(CASE WHEN t.type = 'debit' THEN t.amount ELSE -t.amount END)`;

// Net spend that is zero for Transfer/Income rows — use inside SUM(...) when the
// query spans every category (no category filter in the WHERE clause).
export const SPEND_AMOUNT = `(CASE WHEN ${SPENDING_FILTER} THEN ${NET_SPEND} ELSE 0 END)`;

// Real income: credits in the Income category. Use inside SUM(...).
export const INCOME_AMOUNT = `(CASE WHEN c.name = 'Income' AND t.type = 'credit' THEN t.amount ELSE 0 END)`;
