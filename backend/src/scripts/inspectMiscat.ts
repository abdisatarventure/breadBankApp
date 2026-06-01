import { connectDB, getPool } from '../config/db';
async function main() {
  await connectDB();
  const r = await getPool().request().query(`
    SELECT t.id, CONVERT(varchar(10), t.date, 23) AS date, t.amount,
           a.name AS account, ISNULL(c.name,'(none)') AS category, LEFT(t.description,45) AS descr
    FROM transactions t
    LEFT JOIN accounts a ON a.id=t.account_id
    LEFT JOIN categories c ON c.id=t.category_id
    WHERE t.type='debit' AND ISNULL(c.name,'') <> 'Transfer'
      AND (t.description LIKE '%APPLECARD GSBANK%'
        OR t.description LIKE '%CARD PAYMENT%'
        OR t.description LIKE '%DISCOVER%PAYMENT%'
        OR (t.description LIKE '%ONLINE TRANSFER%' AND (t.description LIKE '%SAVINGS%' OR t.description LIKE '%CHECKING%')))
    ORDER BY t.date DESC
  `);
  let total = 0;
  for (const t of r.recordset) { total += Number(t.amount); console.log(`#${t.id} ${t.date} -$${Number(t.amount).toFixed(2).padStart(9)} ${String(t.account).padEnd(22)} [${t.category}] ${t.descr}`); }
  console.log(`\n${r.recordset.length} mis-categorized self-transfers totaling $${total.toFixed(2)} wrongly counted as spending.`);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
