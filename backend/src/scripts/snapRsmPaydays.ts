/**
 * One-time fix: snap existing RSM paycheck dates to the scheduled payday (1st or
 * 15th), so early direct deposits stop landing in the wrong month/half. Uses the
 * same snapPaydayDate logic that now runs automatically on new CSV/Plaid rows.
 *
 *   cd backend && npx ts-node src/scripts/snapRsmPaydays.ts          (dry run)
 *   cd backend && npx ts-node src/scripts/snapRsmPaydays.ts apply    (commit)
 */
import { connectDB, getPool, sql } from '../config/db';
import { isRsmPayroll, snapPaydayDate } from '../services/csvParser';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function main() {
  const apply = process.argv.includes('apply');
  await connectDB();
  const pool = getPool();

  const rows = (await pool.request()
    .query(`SELECT id, date, description FROM transactions WHERE description LIKE '%RSM%PAYROLL%'`))
    .recordset as { id: number; date: Date; description: string }[];

  let changes = 0;
  for (const r of rows) {
    if (!isRsmPayroll(r.description)) continue;
    // mssql returns DATE at UTC midnight — rebuild a local date from its parts.
    const d = new Date(r.date);
    const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const snapped = snapPaydayDate(local);
    if (ymd(snapped) === ymd(local)) continue; // already on a payday
    console.log(`  ${ymd(local)} -> ${ymd(snapped)}   ${r.description.trim().slice(0, 32)}`);
    changes++;
    if (apply) {
      await pool.request().input('id', sql.Int, r.id).input('d', sql.Date, ymd(snapped))
        .query(`UPDATE transactions SET date = @d, date_overridden = 1 WHERE id = @id`);
    }
  }
  console.log(apply ? `APPLIED — snapped ${changes} paychecks.` : `DRY RUN — ${changes} to snap. Re-run with "apply".`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
