/**
 * Adds AI usage tracking + app settings tables. Idempotent.
 *   npx ts-node src/scripts/migrateAiUsage.ts
 */
import { connectDB, getPool } from '../config/db';

async function main() {
  await connectDB();
  const pool = getPool();

  // One row per calendar month accumulating Claude token usage.
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ai_usage' AND xtype='U')
    CREATE TABLE ai_usage (
      month_key     CHAR(7)   NOT NULL PRIMARY KEY,   -- 'YYYY-MM'
      input_tokens  BIGINT    NOT NULL DEFAULT 0,
      output_tokens BIGINT    NOT NULL DEFAULT 0,
      updated_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);

  // Generic key/value app settings (currently the AI monthly budget).
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='app_settings' AND xtype='U')
    CREATE TABLE app_settings (
      setting_key   NVARCHAR(100) NOT NULL PRIMARY KEY,
      setting_value NVARCHAR(50)  NULL
    );
  `);

  console.log('✓ AI usage migration complete (ai_usage, app_settings)');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
