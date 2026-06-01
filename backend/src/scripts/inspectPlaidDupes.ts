import { connectDB, getPool } from '../config/db';
async function main() {
  await connectDB();
  const pool = getPool();
  console.log('=== plaid_items (linked banks) ===');
  const items = await pool.request().query(`
    SELECT id, user_id, institution, item_id, CONVERT(varchar(19), created_at, 120) AS created
    FROM plaid_items ORDER BY institution, created_at`);
  for (const i of items.recordset) console.log(`item#${i.id} user:${i.user_id} ${String(i.institution).padEnd(14)} ${i.item_id.slice(0,14)}… ${i.created}`);

  console.log('\n=== accounts (investment + any dupes) ===');
  const accts = await pool.request().query(`
    SELECT a.id, a.user_id, a.name, a.type, a.institution,
           CASE WHEN a.plaid_account_id IS NULL THEN 'no' ELSE 'yes' END AS plaid,
           a.current_balance, COUNT(t.id) AS tx
    FROM accounts a LEFT JOIN transactions t ON t.account_id=a.id
    GROUP BY a.id, a.user_id, a.name, a.type, a.institution, a.plaid_account_id, a.current_balance
    ORDER BY a.institution, a.type, a.name`);
  for (const a of accts.recordset) console.log(`acct#${String(a.id).padEnd(3)} user:${a.user_id ?? 'null'} ${String(a.type).padEnd(11)} plaid:${a.plaid} bal:${a.current_balance ?? '—'} tx:${a.tx}  ${a.name}`);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
