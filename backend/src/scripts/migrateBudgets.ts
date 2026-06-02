/**
 * Adds the budgets table (one monthly limit per user + category). Idempotent.
 *   npx ts-node src/scripts/migrateBudgets.ts
 */
import { connectDB, getPool } from '../config/db';

async function main() {
  await connectDB();
  await getPool().request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='budgets' AND xtype='U')
    CREATE TABLE budgets (
      id            INT IDENTITY(1,1) PRIMARY KEY,
      user_id       INT            NOT NULL,
      category_id   INT            NOT NULL,
      monthly_limit DECIMAL(12,2)  NOT NULL,
      created_at    DATETIME2      DEFAULT SYSUTCDATETIME(),
      CONSTRAINT UQ_budget_user_cat UNIQUE (user_id, category_id)
    );
  `);
  console.log('✓ budgets table ready');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
