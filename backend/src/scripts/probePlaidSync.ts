/**
 * Read-only probe of transactionsSync for a user's Plaid items. Calls Plaid with
 * each item's saved cursor and reports how many transactions are available — WITHOUT
 * writing anything to the DB or advancing the cursor. Proves sync works end-to-end.
 *
 *   cd backend && npx ts-node src/scripts/probePlaidSync.ts <userId>
 */
import { connectDB, getPool, sql } from '../config/db';
import { plaid } from '../config/plaid';
import { decryptSecret } from '../config/crypto';

async function main() {
  const userId = Number(process.argv[2]);
  if (!Number.isInteger(userId)) { console.error('Usage: probePlaidSync <userId>'); process.exit(1); }

  await connectDB();
  const items = await getPool().request()
    .input('userId', sql.Int, userId)
    .query(`SELECT item_id, access_token, institution, sync_cursor FROM plaid_items WHERE user_id = @userId`);

  for (const it of items.recordset as { item_id: string; access_token: string; institution: string; sync_cursor: string | null }[]) {
    const token = decryptSecret(it.access_token);
    let cursor: string | undefined = it.sync_cursor || undefined;
    let added = 0, modified = 0, removed = 0, pages = 0, hasMore = true;
    try {
      while (hasMore) {
        const resp = await plaid.transactionsSync({ access_token: token, cursor });
        added += resp.data.added.length;
        modified += resp.data.modified.length;
        removed += resp.data.removed.length;
        cursor = resp.data.next_cursor;
        hasMore = resp.data.has_more;
        pages++;
        if (pages > 20) break; // safety
      }
      console.log(`✓ ${it.institution.padEnd(16)} sync OK — ${pages} page(s), +${added} new / ~${modified} mod / -${removed} removed since last cursor`);
    } catch (e) {
      const data = (e as { response?: { data?: { error_code?: string; error_message?: string } } })?.response?.data;
      console.log(`✗ ${it.institution.padEnd(16)} ${data?.error_code ?? (e instanceof Error ? e.message : 'error')}` +
        (data?.error_message ? ` — ${data.error_message}` : ''));
    }
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
