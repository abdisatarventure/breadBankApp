/**
 * Detect and remove duplicate Plaid items (e.g. the same bank linked twice),
 * keeping the most recent link. For each removed item it deletes that item's
 * accounts (+ their transactions/uploads) and revokes the token at Plaid.
 *
 *   npx ts-node src/scripts/dedupePlaidItems.ts          (dry run)
 *   npx ts-node src/scripts/dedupePlaidItems.ts apply     (perform removal)
 */
import { connectDB, getPool, sql } from '../config/db';
import { plaid } from '../config/plaid';
import { decryptSecret } from '../config/crypto';

interface Item { id: number; user_id: number; institution: string; item_id: string; access_token: string; created_at: Date; }

async function main() {
  const apply = process.argv.includes('apply');
  await connectDB();
  const pool = getPool();

  const items = (await pool.request().query(`
    SELECT id, user_id, institution, item_id, access_token, created_at
    FROM plaid_items ORDER BY user_id, institution, created_at`)).recordset as Item[];

  // Group by user + institution; any group with >1 item is a duplicate link.
  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const key = `${it.user_id}::${it.institution}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(it);
  }

  let anyDupes = false;
  for (const [key, grp] of groups) {
    if (grp.length < 2) continue;
    anyDupes = true;
    const sorted = [...grp].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    const keep = sorted[sorted.length - 1]!;
    const remove = sorted.slice(0, -1);
    console.log(`\n${key} — ${grp.length} links`);
    console.log(`  KEEP   item#${keep.id}  (${keep.created_at.toISOString().slice(0, 19)})`);

    for (const it of remove) {
      let acctIds: string[] = [];
      try {
        const resp = await plaid.accountsGet({ access_token: decryptSecret(it.access_token) });
        acctIds = resp.data.accounts.map((a) => a.account_id);
      } catch (e) {
        console.log(`   ! could not fetch accounts for item#${it.id}: ${(e as Error).message}`);
      }

      let local: { id: number; name: string }[] = [];
      if (acctIds.length) {
        const req = pool.request().input('userId', sql.Int, it.user_id);
        acctIds.forEach((id, i) => req.input(`a${i}`, sql.NVarChar(100), id));
        const placeholders = acctIds.map((_, i) => `@a${i}`).join(',');
        local = (await req.query(
          `SELECT id, name FROM accounts WHERE user_id=@userId AND plaid_account_id IN (${placeholders})`,
        )).recordset as { id: number; name: string }[];
      }

      console.log(`  REMOVE item#${it.id}  (${it.created_at.toISOString().slice(0, 19)}) → ${local.map((a) => `#${a.id} ${a.name}`).join(', ') || '(no local accounts)'}`);

      if (apply) {
        for (const a of local) {
          await pool.request().input('id', sql.Int, a.id).query(`DELETE FROM transactions WHERE account_id=@id`);
          await pool.request().input('id', sql.Int, a.id).query(`DELETE FROM uploads WHERE account_id=@id`);
          await pool.request().input('id', sql.Int, a.id).query(`DELETE FROM accounts WHERE id=@id`);
        }
        try {
          await plaid.itemRemove({ access_token: decryptSecret(it.access_token) });
        } catch (e) {
          console.log(`   ! itemRemove failed (token may already be invalid): ${(e as Error).message}`);
        }
        await pool.request().input('id', sql.Int, it.id).query(`DELETE FROM plaid_items WHERE id=@id`);
        console.log(`   ✓ removed item#${it.id} + ${local.length} account(s)`);
      }
    }
  }

  if (!anyDupes) console.log('No duplicate Plaid links found.');
  else if (!apply) console.log('\nDRY RUN — re-run with "apply" to remove the duplicates above.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
