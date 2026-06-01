/** Read-only: show how transaction dates are actually stored. Run:
 *   npx ts-node src/scripts/inspectDates.ts
 */
import { connectDB, getPool } from '../config/db';

async function main() {
  await connectDB();
  const r = await getPool().request().query(`
    SELECT TOP 8 id, CONVERT(varchar(10), date, 23) AS stored_date, description, merchant, plaid_transaction_id
    FROM transactions ORDER BY date DESC, id DESC
  `);
  for (const t of r.recordset) {
    console.log(`#${t.id}  ${t.stored_date}  plaid:${t.plaid_transaction_id ? 'y' : 'n'}  ${(t.merchant || t.description || '').slice(0, 40)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
