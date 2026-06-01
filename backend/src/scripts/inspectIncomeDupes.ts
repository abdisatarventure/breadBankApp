import { connectDB, getPool } from '../config/db';
async function main() {
  await connectDB();
  const pool = getPool();
  // May 2026 credits grouped by date+amount with >1 row.
  const groups = await pool.request().query(`
    SELECT CONVERT(varchar(10),t.date,23) AS date, t.amount, COUNT(*) AS copies
    FROM transactions t
    WHERE t.type='credit' AND t.date >= '2026-05-01' AND t.date <= '2026-05-31'
    GROUP BY t.date, t.amount HAVING COUNT(*) > 1
    ORDER BY t.date`);
  console.log(`May credit groups with >1 row: ${groups.recordset.length}\n`);
  for (const g of groups.recordset) {
    const rows = await pool.request()
      .input('d', g.date).input('a', g.amount)
      .query(`SELECT t.id, a.name AS account, a.institution, ISNULL(c.name,'-') AS cat,
                     CASE WHEN t.plaid_transaction_id IS NULL THEN 'CSV' ELSE 'Plaid' END AS src,
                     LEFT(t.description,42) AS descr
              FROM transactions t JOIN accounts a ON a.id=t.account_id
              LEFT JOIN categories c ON c.id=t.category_id
              WHERE t.type='credit' AND t.date=@d AND t.amount=@a`);
    console.log(`${g.date}  $${Number(g.amount).toFixed(2)}  x${g.copies}`);
    for (const r of rows.recordset) console.log(`   #${String(r.id).padEnd(4)} ${r.src.padEnd(5)} ${String(r.account).slice(0,20).padEnd(20)} [${r.cat}] ${r.descr}`);
  }
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
