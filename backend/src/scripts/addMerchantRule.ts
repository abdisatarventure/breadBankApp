/**
 * Adds a description→category rule so future imports (CSV upload + Plaid sync)
 * auto-file matching transactions, and backfills any existing matches.
 * Idempotent — safe to run more than once.
 *
 *   npx ts-node src/scripts/addMerchantRule.ts "ZELLE FROM ALI YACOB" "Rent"
 *
 * Defaults to the roommate-rent Zelle case when no args are given. The pattern
 * is matched as a substring (description LIKE '%pattern%'), so use the STABLE
 * part of the description — e.g. "ZELLE FROM ALI YACOB" matches every future
 * one regardless of the trailing date / REF #.
 */
import { connectDB, getPool, sql } from '../config/db';

const pattern = (process.argv[2] ?? 'ZELLE FROM ALI YACOB').trim();
const categoryName = (process.argv[3] ?? 'Rent').trim();

async function main() {
  await connectDB();
  const pool = getPool();

  // Which user(s) have transactions matching this pattern? (Personal app: one.)
  const usersRes = await pool.request()
    .input('pattern', sql.NVarChar(200), pattern)
    .query(`
      SELECT DISTINCT user_id FROM transactions
      WHERE description LIKE '%' + @pattern + '%'
    `);
  let userIds = usersRes.recordset.map((r) => r.user_id as number);

  // Nothing matches yet → fall back to the sole user, if there is exactly one.
  if (userIds.length === 0) {
    const u = await pool.request().query(`SELECT id FROM users`);
    if (u.recordset.length === 1) userIds = [u.recordset[0]!.id as number];
  }

  if (userIds.length === 0) {
    console.error(
      'Could not determine the user (no matching transactions and not exactly one user). ' +
      'Categorize one matching transaction in the app first, then re-run.',
    );
    process.exit(1);
  }

  for (const userId of userIds) {
    // Prefer the user's own category; fall back to a system one of the same name.
    const catRes = await pool.request()
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar(100), categoryName)
      .query(`
        SELECT TOP 1 id FROM categories
        WHERE name = @name AND (user_id = @userId OR user_id IS NULL)
        ORDER BY CASE WHEN user_id = @userId THEN 0 ELSE 1 END
      `);
    const categoryId = (catRes.recordset[0] as { id: number } | undefined)?.id;
    if (!categoryId) {
      console.error(`User ${userId}: no category named "${categoryName}" — create it first. Skipping.`);
      continue;
    }

    // Upsert the forward rule used by the import categorizer.
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('pattern', sql.NVarChar(200), pattern)
      .input('categoryId', sql.Int, categoryId)
      .query(`
        IF EXISTS (SELECT 1 FROM merchant_rules WHERE merchant_pattern = @pattern AND user_id = @userId)
          UPDATE merchant_rules SET category_id = @categoryId WHERE merchant_pattern = @pattern AND user_id = @userId
        ELSE
          INSERT INTO merchant_rules (user_id, merchant_pattern, category_id) VALUES (@userId, @pattern, @categoryId)
      `);

    // Backfill any existing matches so today's transactions follow the rule too.
    const upd = await pool.request()
      .input('userId', sql.Int, userId)
      .input('pattern', sql.NVarChar(200), pattern)
      .input('categoryId', sql.Int, categoryId)
      .query(`
        UPDATE transactions SET category_id = @categoryId
        WHERE user_id = @userId AND description LIKE '%' + @pattern + '%'
      `);

    console.log(
      `User ${userId}: rule "${pattern}" → "${categoryName}" saved; ` +
      `${upd.rowsAffected[0] ?? 0} existing transaction(s) recategorized.`,
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
