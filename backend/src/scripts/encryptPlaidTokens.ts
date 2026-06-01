/**
 * One-off: widen plaid_items.access_token and encrypt any rows still stored as
 * plaintext. Idempotent — already-encrypted rows are skipped.
 *
 *   npx ts-node src/scripts/encryptPlaidTokens.ts
 *
 * Requires PLAID_ENC_KEY to be set in backend/.env first.
 */
import { connectDB, getPool, sql } from '../config/db';
import { encryptSecret, isEncrypted } from '../config/crypto';

async function main() {
  await connectDB();
  const pool = getPool();

  // Encrypted payloads are longer than the original 200-char tokens.
  await pool.request().query(`
    IF EXISTS (SELECT 1 FROM sys.columns WHERE Name='access_token' AND Object_ID=Object_ID('plaid_items'))
    ALTER TABLE plaid_items ALTER COLUMN access_token NVARCHAR(500) NOT NULL;
  `);

  const rows = await pool.request().query(`SELECT id, access_token FROM plaid_items`);
  let encrypted = 0;
  for (const r of rows.recordset as { id: number; access_token: string }[]) {
    if (isEncrypted(r.access_token)) continue;
    await pool.request()
      .input('id', sql.Int, r.id)
      .input('token', sql.NVarChar(500), encryptSecret(r.access_token))
      .query(`UPDATE plaid_items SET access_token = @token WHERE id = @id`);
    encrypted++;
  }

  console.log(`✓ Token column widened; encrypted ${encrypted} plaintext token(s), ${rows.recordset.length - encrypted} already encrypted.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
