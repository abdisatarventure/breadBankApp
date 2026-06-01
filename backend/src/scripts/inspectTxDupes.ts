import { connectDB, getPool } from '../config/db';
async function main() {
  await connectDB();
  const pool = getPool();

  // Groups of transactions that look identical within the same account.
  const r = await pool.request().query(`
    SELECT a.name AS account, a.institution, CONVERT(varchar(10),t.date,23) AS date, t.type, t.amount,
           LEFT(t.description,40) AS descr, COUNT(*) AS copies,
           SUM(CASE WHEN t.plaid_transaction_id IS NULL THEN 1 ELSE 0 END) AS csv_copies,
           SUM(CASE WHEN t.plaid_transaction_id IS NOT NULL THEN 1 ELSE 0 END) AS plaid_copies
    FROM transactions t JOIN accounts a ON a.id=t.account_id
    GROUP BY a.name, a.institution, t.account_id, t.date, t.type, t.amount, t.description
    HAVING COUNT(*) > 1
    ORDER BY t.date DESC
  `);
  let extra = 0;
  for (const g of r.recordset) {
    extra += g.copies - 1;
    console.log(`${g.date} ${g.type.padEnd(6)} $${Number(g.amount).toFixed(2).padStart(9)} x${g.copies} (csv:${g.csv_copies} plaid:${g.plaid_copies}) ${String(g.account).slice(0,22).padEnd(22)} ${g.descr}`);
  }
  console.log(`\n${r.recordset.length} duplicate groups; ${extra} redundant rows overall.`);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
