/**
 * Adds transactions.date_overridden — set when a user manually edits a
 * transaction's date so Plaid sync won't reset it. Idempotent.
 *   npx ts-node src/scripts/migrateDateOverride.ts
 */
import { connectDB, getPool } from '../config/db';

async function main() {
  await connectDB();
  await getPool().request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='date_overridden' AND Object_ID=Object_ID('transactions'))
    ALTER TABLE transactions ADD date_overridden BIT NOT NULL DEFAULT 0;
  `);
  console.log('✓ transactions.date_overridden ready');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
