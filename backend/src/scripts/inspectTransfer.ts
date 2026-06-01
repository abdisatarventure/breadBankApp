/** Read-only: inspect the Apple Card payment + its matching checking-side leg. */
import { connectDB, getPool } from '../config/db';

async function main() {
  await connectDB();
  const r = await getPool().request().query(`
    SELECT TOP 30 t.id, CONVERT(varchar(10), t.date, 23) AS date, t.type, t.amount,
           a.name AS account, ISNULL(c.name,'(uncategorized)') AS category,
           LEFT(t.description, 50) AS description
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.amount BETWEEN 1544 AND 1545
       OR t.description LIKE '%APPLECARD%'
       OR t.description LIKE '%7114%'
       OR (t.description LIKE '%APPLE%' AND t.description LIKE '%PAYMENT%')
    ORDER BY t.date DESC
  `);
  for (const t of r.recordset) {
    console.log(`#${t.id} ${t.date} ${t.type.padEnd(6)} $${Number(t.amount).toFixed(2).padStart(9)}  ${String(t.account).padEnd(22)} [${t.category}]  ${t.description}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
