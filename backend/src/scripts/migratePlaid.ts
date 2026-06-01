/**
 * One-off migration to add Plaid support to an existing breadbank database.
 * Run with:  npx ts-node src/scripts/migratePlaid.ts
 *
 * Idempotent — safe to run more than once.
 */
import { connectDB, getPool } from '../config/db';

async function main() {
  await connectDB();
  const pool = getPool();

  // Stores one row per linked bank login (Plaid "item"). access_token is the
  // long-lived credential used to pull that bank's data; cursor tracks how far
  // we've synced so each sync only fetches new/changed transactions.
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='plaid_items' AND xtype='U')
    CREATE TABLE plaid_items (
      id           INT IDENTITY(1,1) PRIMARY KEY,
      user_id      INT            NOT NULL,
      item_id      NVARCHAR(100)  NOT NULL,
      access_token NVARCHAR(200)  NOT NULL,
      institution  NVARCHAR(200)  NULL,
      sync_cursor  NVARCHAR(MAX)  NULL,
      created_at   DATETIME2      DEFAULT SYSUTCDATETIME()
    );
  `);

  // Link each of our accounts/transactions rows back to its Plaid id so syncs
  // can map Plaid data onto existing rows instead of creating duplicates.
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='plaid_account_id' AND Object_ID=Object_ID('accounts'))
    ALTER TABLE accounts ADD plaid_account_id NVARCHAR(100) NULL;
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='plaid_transaction_id' AND Object_ID=Object_ID('transactions'))
    ALTER TABLE transactions ADD plaid_transaction_id NVARCHAR(100) NULL;
  `);

  // Real current balance reported by the bank via Plaid. For CSV-only accounts
  // this stays NULL and the app falls back to its transaction-derived balance.
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='current_balance' AND Object_ID=Object_ID('accounts'))
    ALTER TABLE accounts ADD current_balance DECIMAL(14,2) NULL;
  `);

  console.log('✓ Plaid migration complete (plaid_items + plaid_account_id, plaid_transaction_id, current_balance)');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
