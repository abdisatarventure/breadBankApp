/**
 * Remove CSV-imported transactions that duplicate Plaid-synced ones on the same
 * account. Conservative: within each (account, date, amount, type) bucket it
 * deletes at most as many CSV rows as there are Plaid rows, so the real count is
 * never reduced below Plaid's. Keeps the Plaid rows (the live source).
 *
 *   npx ts-node src/scripts/dedupeTransactions.ts          (dry run)
 *   npx ts-node src/scripts/dedupeTransactions.ts apply
 */
import { connectDB, getPool, sql } from '../config/db';

const QUERY = `
  WITH plaid_counts AS (
    SELECT account_id, date, amount, type, COUNT(*) AS pc
    FROM transactions WHERE plaid_transaction_id IS NOT NULL
    GROUP BY account_id, date, amount, type
  ),
  csv_ranked AS (
    SELECT id, account_id, date, amount, type,
           ROW_NUMBER() OVER (PARTITION BY account_id, date, amount, type ORDER BY id) AS rn
    FROM transactions WHERE plaid_transaction_id IS NULL
  )
  SELECT cr.id, a.name AS account,
         CONVERT(varchar(10), t.date, 23) AS tdate, t.type AS ttype, t.amount,
         LEFT(t.description, 38) AS descr
  FROM csv_ranked cr
  JOIN plaid_counts pc
    ON pc.account_id=cr.account_id AND pc.date=cr.date AND pc.amount=cr.amount AND pc.type=cr.type
  JOIN transactions t ON t.id = cr.id
  JOIN accounts a ON a.id = t.account_id
  WHERE cr.rn <= pc.pc
  ORDER BY t.date DESC
`;

async function main() {
  const apply = process.argv.includes('apply');
  await connectDB();
  const pool = getPool();

  const rows = (await pool.request().query(QUERY)).recordset as
    { id: number; account: string; tdate: string; ttype: string; amount: number; descr: string }[];

  const byAccount = new Map<string, number>();
  for (const r of rows) byAccount.set(r.account, (byAccount.get(r.account) ?? 0) + 1);

  console.log(`${apply ? 'DELETING' : 'DRY RUN'} — ${rows.length} CSV duplicates to remove:\n`);
  for (const [acct, n] of byAccount) console.log(`  ${String(n).padStart(4)}  ${acct}`);

  if (apply && rows.length) {
    const ids = rows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const req = pool.request();
      chunk.forEach((id, j) => req.input(`id${j}`, sql.Int, id));
      await req.query(`DELETE FROM transactions WHERE id IN (${chunk.map((_, j) => `@id${j}`).join(',')})`);
    }
    console.log(`\n✓ Deleted ${ids.length} duplicate CSV transactions.`);
  } else if (!apply) {
    console.log(`\nRe-run with "apply" to delete them (Plaid copies kept).`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
