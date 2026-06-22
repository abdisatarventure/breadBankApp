/**
 * Upgrades an OLDER single-user database to full multi-user data separation.
 * Idempotent — safe to run more than once.
 *
 *   cd backend
 *   npx ts-node src/scripts/migrateMultiUser.ts
 *
 * What it does:
 *  1. Adds the password-reset columns (security_question / security_answer) to users.
 *  2. Claims the old shared (user_id IS NULL) seeded accounts for the owner — the
 *     first registered user — and hands any OTHER user their own copy of any shared
 *     account they had transactions in, so balances no longer bleed across users.
 *  3. Rebuilds ai_usage so Claude token spend is tracked per user (was global).
 *  4. Rebuilds app_settings so the AI monthly budget is per user (was global).
 *
 * Fresh installs don't need this — 01_schema.sql + 02_seed.sql already produce the
 * new shape and accounts are created per user at registration.
 */
import { connectDB, getPool, sql } from '../config/db';

async function columnExists(table: string, column: string): Promise<boolean> {
  const r = await getPool().request().query(
    `SELECT 1 FROM sys.columns WHERE Name='${column}' AND Object_ID=Object_ID('${table}')`,
  );
  return r.recordset.length > 0;
}

async function main() {
  await connectDB();
  const pool = getPool();

  // ── 1. Password-reset columns ──────────────────────────────────────
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='security_question' AND Object_ID=Object_ID('users'))
        ALTER TABLE users ADD security_question NVARCHAR(300) NULL;
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='security_answer' AND Object_ID=Object_ID('users'))
        ALTER TABLE users ADD security_answer NVARCHAR(200) NULL;
  `);
  console.log('✓ users.security_question / security_answer ensured');

  const ownerRow = await pool.request().query(`SELECT MIN(id) AS owner FROM users`);
  const owner = (ownerRow.recordset[0] as { owner: number | null }).owner;

  if (owner == null) {
    console.log('No users yet — nothing to migrate. (Accounts/usage are created at registration.)');
    process.exit(0);
  }

  // ── 2. De-share accounts ───────────────────────────────────────────
  // Any non-owner user with transactions in a shared account gets their own copy.
  const shared = await pool.request().query(`
    SELECT DISTINCT t.user_id, t.account_id
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE a.user_id IS NULL AND t.user_id <> ${owner}
  `);

  for (const row of shared.recordset as { user_id: number; account_id: number }[]) {
    const copy = await pool.request()
      .input('uid', sql.Int, row.user_id)
      .input('aid', sql.Int, row.account_id)
      .query(`
        INSERT INTO accounts (user_id, name, type, institution, plaid_account_id, current_balance)
        OUTPUT INSERTED.id
        SELECT @uid, name, type, institution, plaid_account_id, current_balance
        FROM accounts WHERE id = @aid
      `);
    const newId = (copy.recordset[0] as { id: number }).id;
    await pool.request().input('uid', sql.Int, row.user_id).input('aid', sql.Int, row.account_id).input('nid', sql.Int, newId)
      .query(`UPDATE transactions SET account_id = @nid WHERE user_id = @uid AND account_id = @aid`);
    await pool.request().input('uid', sql.Int, row.user_id).input('aid', sql.Int, row.account_id).input('nid', sql.Int, newId)
      .query(`UPDATE uploads SET account_id = @nid WHERE user_id = @uid AND account_id = @aid`);
    console.log(`  • copied shared account ${row.account_id} → ${newId} for user ${row.user_id}`);
  }

  // The owner inherits whatever shared accounts remain.
  const claimed = await pool.request()
    .input('owner', sql.Int, owner)
    .query(`UPDATE accounts SET user_id = @owner WHERE user_id IS NULL`);
  console.log(`✓ accounts de-shared (${claimed.rowsAffected[0]} claimed by owner user ${owner})`);

  // ── 3. ai_usage → per user ─────────────────────────────────────────
  if (await pool.request().query(`SELECT 1 FROM sysobjects WHERE name='ai_usage' AND xtype='U'`).then(r => r.recordset.length > 0)) {
    if (!(await columnExists('ai_usage', 'user_id'))) {
      await pool.request().query(`ALTER TABLE ai_usage ADD user_id INT NULL`);
      await pool.request().input('owner', sql.Int, owner)
        .query(`UPDATE ai_usage SET user_id = @owner WHERE user_id IS NULL`);
      await pool.request().query(`
        DECLARE @pk SYSNAME = (SELECT name FROM sys.key_constraints WHERE parent_object_id=OBJECT_ID('ai_usage') AND type='PK');
        IF @pk IS NOT NULL EXEC('ALTER TABLE ai_usage DROP CONSTRAINT ' + @pk);
        ALTER TABLE ai_usage ALTER COLUMN user_id INT NOT NULL;
        ALTER TABLE ai_usage ADD CONSTRAINT PK_ai_usage PRIMARY KEY (user_id, month_key);
      `);
      console.log('✓ ai_usage rebuilt per user (existing rows attributed to owner)');
    } else {
      console.log('• ai_usage already per user — skipped');
    }
  }

  // ── 4. app_settings → per user ─────────────────────────────────────
  if (await pool.request().query(`SELECT 1 FROM sysobjects WHERE name='app_settings' AND xtype='U'`).then(r => r.recordset.length > 0)) {
    if (!(await columnExists('app_settings', 'user_id'))) {
      await pool.request().query(`ALTER TABLE app_settings ADD user_id INT NULL`);
      await pool.request().input('owner', sql.Int, owner)
        .query(`UPDATE app_settings SET user_id = @owner WHERE user_id IS NULL`);
      await pool.request().query(`
        DECLARE @pk SYSNAME = (SELECT name FROM sys.key_constraints WHERE parent_object_id=OBJECT_ID('app_settings') AND type='PK');
        IF @pk IS NOT NULL EXEC('ALTER TABLE app_settings DROP CONSTRAINT ' + @pk);
        ALTER TABLE app_settings ALTER COLUMN user_id INT NOT NULL;
        ALTER TABLE app_settings ADD CONSTRAINT PK_app_settings PRIMARY KEY (user_id, setting_key);
      `);
      console.log('✓ app_settings rebuilt per user (existing settings attributed to owner)');
    } else {
      console.log('• app_settings already per user — skipped');
    }
  }

  console.log('\nMulti-user migration complete.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
