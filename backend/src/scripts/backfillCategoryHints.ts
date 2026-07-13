/**
 * Re-apply the deterministic categoryHint rules (self-transfers → Transfer,
 * incoming Zelle → Income, refunds → Refund) to a user's EXISTING transactions.
 *
 * Fixes rows that were mis-categorized by the AI before those hints existed —
 * e.g. an "APPLE CASH BANK XFER" filed under Subscriptions, or a "ZELLE FROM"
 * filed under Rent, both of which wrongly dent spending as category credits.
 *
 *   npx ts-node src/scripts/backfillCategoryHints.ts <userId>          (dry run)
 *   npx ts-node src/scripts/backfillCategoryHints.ts <userId> apply    (commit)
 *
 * Only rows the hint has a definite opinion on are touched; everything the AI
 * categorized normally is left alone.
 */
import { connectDB, getPool, sql } from '../config/db';
import { categoryHint } from '../services/csvParser';

async function main() {
  const userId = Number(process.argv[2]);
  const apply = process.argv.includes('apply');
  // Optional "only:<Category>" arg — restrict changes to a single target category
  // so a targeted fix (e.g. just card payments) can't disturb manual edits elsewhere.
  const onlyArg = process.argv.find((a) => a.startsWith('only:'));
  const onlyCategory = onlyArg ? onlyArg.slice('only:'.length) : null;
  if (!Number.isInteger(userId)) { console.error('Usage: backfillCategoryHints <userId> [apply] [only:<Category>]'); process.exit(1); }

  await connectDB();
  const pool = getPool();

  const cats = await pool.request().query(`SELECT id, name FROM categories WHERE user_id IS NULL`);
  const idByName: Record<string, number> = {};
  const nameById: Record<number, string> = {};
  for (const c of cats.recordset as { id: number; name: string }[]) { idByName[c.name] = c.id; nameById[c.id] = c.name; }

  const txs = await pool.request()
    .input('uid', sql.Int, userId)
    .query(`SELECT id, description, type, category_id FROM transactions WHERE user_id = @uid`);

  const summary: Record<string, number> = {};
  const toChange: { id: number; targetId: number }[] = [];
  for (const t of txs.recordset as { id: number; description: string; type: 'debit' | 'credit'; category_id: number | null }[]) {
    const hint = categoryHint(t.description, t.type);
    if (!hint.category) continue;
    if (onlyCategory && hint.category !== onlyCategory) continue;
    const targetId = idByName[hint.category];
    if (!targetId || t.category_id === targetId) continue;
    const from = t.category_id != null ? (nameById[t.category_id] ?? '(other)') : '(none)';
    // categoryHint is authoritative for the patterns it matches (transfers,
    // payroll/business income, person-to-person reimbursements, refunds), so we
    // let it correct any current category, including reshuffling person Zelle
    // out of Income/Transfer into Reimbursement.
    summary[`${from} -> ${hint.category}`] = (summary[`${from} -> ${hint.category}`] ?? 0) + 1;
    toChange.push({ id: t.id, targetId });
  }

  console.log(`${apply ? 'APPLYING' : 'DRY RUN'} — user ${userId}: ${toChange.length} rows to recategorize`);
  for (const [k, v] of Object.entries(summary).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`);

  if (apply) {
    for (const c of toChange) {
      await pool.request().input('id', sql.Int, c.id).input('cid', sql.Int, c.targetId)
        .query(`UPDATE transactions SET category_id = @cid WHERE id = @id`);
    }
    console.log('Done.');
  } else if (toChange.length) {
    console.log('\nRe-run with "apply" to commit.');
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
