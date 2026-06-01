/** Read-only: list accounts with stored vs derived balances. Run:
 *   npx ts-node src/scripts/inspectAccounts.ts
 */
import { connectDB, getPool } from '../config/db';

async function main() {
  await connectDB();
  const pool = getPool();
  const r = await pool.request().query(`
    SELECT a.id, a.user_id, a.name, a.type, a.institution,
           a.plaid_account_id, a.current_balance,
           COUNT(t.id) AS tx_count,
           SUM(CASE WHEN t.type='credit' THEN t.amount ELSE -t.amount END) AS derived_balance
    FROM accounts a
    LEFT JOIN transactions t ON t.account_id = a.id
    GROUP BY a.id, a.user_id, a.name, a.type, a.institution, a.plaid_account_id, a.current_balance
    ORDER BY a.institution, a.name
  `);
  for (const a of r.recordset) {
    console.log({
      id: a.id, user: a.user_id, name: a.name, type: a.type, inst: a.institution,
      plaid: a.plaid_account_id ? 'yes' : 'no',
      current_balance: a.current_balance,
      derived_balance: a.derived_balance,
      tx_count: a.tx_count,
    });
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
