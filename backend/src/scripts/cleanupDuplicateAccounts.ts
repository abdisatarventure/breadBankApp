/**
 * Remove old CSV-imported accounts that are now duplicated by a Plaid link,
 * along with their transactions and upload records.
 *
 *   npx ts-node src/scripts/cleanupDuplicateAccounts.ts          (dry run — shows what would go)
 *   npx ts-node src/scripts/cleanupDuplicateAccounts.ts apply    (actually deletes)
 *
 * Edit DUPLICATE_IDS if the set of duplicates changes.
 */
import { connectDB, getPool, sql } from '../config/db';

// CSV accounts superseded by a Plaid-linked equivalent.
const DUPLICATE_IDS = [1, 2, 4]; // Checking, Savings, Discover Card

async function main() {
  const apply = process.argv.includes('apply');
  await connectDB();
  const pool = getPool();

  const idList = DUPLICATE_IDS.join(',');
  const preview = await pool.request().query(`
    SELECT a.id, a.name, a.type, a.plaid_account_id,
           COUNT(t.id) AS tx_count
    FROM accounts a
    LEFT JOIN transactions t ON t.account_id = a.id
    WHERE a.id IN (${idList})
    GROUP BY a.id, a.name, a.type, a.plaid_account_id
  `);

  console.log(apply ? '── APPLYING deletion ──' : '── DRY RUN (no changes) ──');
  for (const a of preview.recordset) {
    const guard = a.plaid_account_id ? '  ⚠️ SKIP: this is a Plaid account!' : '';
    console.log(`  account #${a.id} "${a.name}" (${a.type}) — ${a.tx_count} transactions${guard}`);
  }

  // Safety: never delete an account that is itself Plaid-linked.
  const safeIds = preview.recordset.filter((a) => !a.plaid_account_id).map((a) => a.id);
  if (safeIds.length === 0) { console.log('Nothing to delete.'); process.exit(0); }

  if (!apply) {
    console.log('\nRe-run with "apply" to delete the above accounts and their data.');
    process.exit(0);
  }

  const safeList = safeIds.join(',');
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    // FK order: transactions → uploads → accounts.
    const delTx = await new sql.Request(tx).query(`DELETE FROM transactions WHERE account_id IN (${safeList})`);
    const delUp = await new sql.Request(tx).query(`DELETE FROM uploads WHERE account_id IN (${safeList})`);
    const delAc = await new sql.Request(tx).query(`DELETE FROM accounts WHERE id IN (${safeList})`);
    await tx.commit();
    console.log(`\n✓ Deleted ${delTx.rowsAffected[0]} transactions, ${delUp.rowsAffected[0]} uploads, ${delAc.rowsAffected[0]} accounts.`);
  } catch (e) {
    await tx.rollback();
    throw e;
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
