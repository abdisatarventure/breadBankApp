/**
 * Marks already-imported transactions as historical (Reports-only). Historical
 * rows still appear in Reports but are excluded from the dashboard's current
 * account balances / debt, so a prior-year backfill doesn't move them.
 *
 *   cd backend
 *   npx ts-node src/scripts/markHistorical.ts          # all PRIOR years (< this year)
 *   npx ts-node src/scripts/markHistorical.ts 2025     # just that year
 *   npx ts-node src/scripts/markHistorical.ts 2025 off # UN-mark that year
 *
 * Idempotent. Applies to every user's data (run by the self-hoster).
 */
import { connectDB, getPool, sql } from '../config/db';

async function main() {
  const yearArg = process.argv[2];
  const off = process.argv[3] === 'off';
  const value = off ? 0 : 1;

  await connectDB();
  const pool = getPool();

  // Make sure the column exists (so this script also works as the migration).
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE Name='is_historical' AND Object_ID=Object_ID('transactions'))
      ALTER TABLE transactions ADD is_historical BIT NOT NULL DEFAULT 0;
  `);

  const req = pool.request().input('val', sql.Bit, value);
  let where: string;
  if (yearArg && /^\d{4}$/.test(yearArg)) {
    req.input('year', sql.Int, Number(yearArg));
    where = 'YEAR(date) = @year';
  } else {
    where = 'YEAR(date) < YEAR(GETDATE())';
  }

  const result = await req.query(`UPDATE transactions SET is_historical = @val WHERE ${where}`);
  const n = result.rowsAffected[0] ?? 0;
  console.log(`${off ? 'Un-marked' : 'Marked'} ${n} transaction(s) as historical (${yearArg ?? 'all prior years'}).`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
