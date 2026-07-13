/**
 * Add mock demo data for July–December 2026, alternating good months (net
 * positive — normal spend, sometimes a bonus) and bad months (net negative — a
 * big purchase or two). Also sprinkles a few "Unknown" (uncategorized) rows.
 * Re-runnable: wipes only the demo user's Jul–Dec 2026 rows first.
 *
 *   cd backend && npx ts-node src/scripts/seedDemoFutureMonths.ts
 */
import { connectDB, getPool, sql } from '../config/db';

let _seed = 42424242;
const rng = () => { _seed = (_seed * 1664525 + 1013904223) % 4294967296; return _seed / 4294967296; };
const rand = (lo: number, hi: number) => lo + rng() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));
const pick = <T,>(a: T[]): T => a[Math.floor(rng() * a.length)]!;
const money = (n: number) => Math.round(n * 100) / 100;
const chance = (p: number) => rng() < p;

async function main() {
  await connectDB();
  const pool = getPool();

  const uid = (await pool.request().query(`SELECT id FROM users WHERE email='test@gmail.com'`))
    .recordset[0]?.id as number | undefined;
  if (!uid) { console.error('Demo user not found — run seedDemoAccount first.'); process.exit(1); }

  const cats = (await pool.request().query(`SELECT id, name FROM categories WHERE user_id IS NULL`)).recordset as { id: number; name: string }[];
  const catId: Record<string, number> = {}; for (const c of cats) catId[c.name] = c.id;
  const cat = (n: string) => { const id = catId[n]; if (!id) throw new Error('missing category ' + n); return id; };

  const accts = (await pool.request().input('uid', sql.Int, uid).query(`SELECT id, name FROM accounts WHERE user_id=@uid`)).recordset as { id: number; name: string }[];
  const acctId: Record<string, number> = {}; for (const a of accts) acctId[a.name] = a.id;

  await pool.request().input('uid', sql.Int, uid)
    .query(`DELETE FROM transactions WHERE user_id=@uid AND date >= '2026-07-01' AND date <= '2026-12-31'`);

  let n = 0;
  const addTx = async (o: { date: Date; desc: string; merchant: string; amount: number; type: 'debit' | 'credit'; account: string; category: string; recurring?: boolean }) => {
    await pool.request()
      .input('uid', sql.Int, uid).input('aid', sql.Int, acctId[o.account])
      .input('date', sql.Date, o.date).input('desc', sql.NVarChar(500), o.desc)
      .input('merch', sql.NVarChar(200), o.merchant).input('amt', sql.Decimal(12, 2), money(o.amount))
      .input('type', sql.NVarChar(10), o.type).input('cat', sql.Int, cat(o.category))
      .input('rec', sql.Bit, o.recurring ? 1 : 0)
      .query(`INSERT INTO transactions (user_id, account_id, date, description, merchant, amount, type, category_id, is_recurring, is_historical)
              VALUES (@uid,@aid,@date,@desc,@merch,@amt,@type,@cat,@rec,0)`);
    n++;
  };

  const card = () => pick(['Apple Card', 'Discover Card']);
  const D = (m: number, day: number) => new Date(2026, m - 1, day);

  const SUBS = [
    { merchant: 'NETFLIX.COM', amount: 15.99, category: 'Entertainment', account: 'Apple Card', day: 4 },
    { merchant: 'SPOTIFY USA', amount: 11.99, category: 'Entertainment', account: 'Apple Card', day: 7 },
    { merchant: 'DISNEY PLUS', amount: 13.99, category: 'Entertainment', account: 'Discover Card', day: 9 },
    { merchant: 'ADOBE CREATIVE CLOUD', amount: 54.99, category: 'Subscriptions', account: 'Apple Card', day: 18 },
    { merchant: 'PLANET FITNESS', amount: 24.99, category: 'Health & Medical', account: 'Discover Card', day: 15 },
    { merchant: 'AMAZON PRIME', amount: 14.99, category: 'Subscriptions', account: 'Apple Card', day: 21 },
  ];
  const BILLS = [
    { merchant: 'SUNSET RIDGE APARTMENTS', amount: 1750, category: 'Housing', day: 1 },
    { merchant: 'XFINITY INTERNET', amount: 79.99, category: 'Subscriptions', day: 6 },
    { merchant: 'CITY POWER & LIGHT', amount: 98, category: 'Housing', day: 10, jitter: 35 },
    { merchant: 'GEICO AUTO INSURANCE', amount: 112, category: 'Transportation', day: 14 },
    { merchant: 'T-MOBILE WIRELESS', amount: 70, category: 'Subscriptions', day: 19 },
  ];
  const GROCERS = ['WHOLE FOODS MARKET', "TRADER JOE'S", 'SAFEWAY', 'KROGER', 'COSTCO WHOLESALE'];
  const DINING = ['CHIPOTLE', 'STARBUCKS', 'OLIVE GARDEN', 'DOORDASH', 'SHAKE SHACK', 'CHICK-FIL-A'];
  const SHOPPING = ['AMAZON.COM', 'TARGET', 'BEST BUY', 'NIKE.COM', 'IKEA'];
  const BIG = [
    { desc: "MIDTOWN AUTO TRANSMISSION REPAIR", merchant: 'Midtown Auto', category: 'Transportation', lo: 1800, hi: 2600 },
    { desc: 'DELTA AIR LINES 0062319', merchant: 'DELTA AIR LINES', category: 'Travel', lo: 900, hi: 1700 },
    { desc: 'BEST BUY #1423 - LAPTOP', merchant: 'BEST BUY', category: 'Shopping', lo: 1500, hi: 2400 },
    { desc: 'CITY DENTAL ASSOCIATES - CROWN', merchant: 'City Dental', category: 'Health & Medical', lo: 1100, hi: 1900 },
    { desc: 'MARRIOTT HOTELS WEEKEND', merchant: 'MARRIOTT HOTELS', category: 'Travel', lo: 800, hi: 1500 },
  ];

  // Jul–Dec: alternate good / bad (Dec = bad for holiday spend).
  const profile: Record<number, 'good' | 'bad'> = { 7: 'good', 8: 'bad', 9: 'good', 10: 'bad', 11: 'good', 12: 'bad' };

  for (let m = 7; m <= 12; m++) {
    const bad = profile[m] === 'bad';
    const maxDay = new Date(2026, m, 0).getDate();
    const day = (d: number) => Math.min(d, maxDay);

    // Income — two paychecks; good months also get a bonus / side gig.
    for (const p of [1, 15]) await addTx({ date: D(m, p), desc: 'ACME CORP PAYROLL DIRECT DEP', merchant: 'ACME CORP PAYROLL', amount: rand(2380, 2460), type: 'credit', account: 'Everyday Checking', category: 'Income', recurring: true });
    if (!bad) await addTx({ date: D(m, randInt(10, 22)), desc: m === 12 ? 'ACME CORP YEAR-END BONUS' : 'STRIPE TRANSFER FREELANCE', merchant: m === 12 ? 'ACME CORP' : 'STRIPE PAYOUT', amount: rand(1200, 2600), type: 'credit', account: 'Everyday Checking', category: 'Income' });

    // Recurring bills + subscriptions.
    for (const b of BILLS) await addTx({ date: D(m, b.day), desc: b.merchant, merchant: b.merchant, amount: b.amount + (b.jitter ? rand(-b.jitter, b.jitter) : 0), type: 'debit', account: 'Everyday Checking', category: b.category, recurring: true });
    for (const s of SUBS) await addTx({ date: D(m, s.day), desc: `${s.merchant} SUBSCRIPTION`, merchant: s.merchant, amount: s.amount, type: 'debit', account: s.account, category: s.category, recurring: true });

    // Everyday spend — heavier in bad months.
    const mult = bad ? 1.7 : 1.0;
    for (let i = 0; i < randInt(4, 6); i++) await addTx({ date: D(m, day(randInt(2, 27))), desc: pick(GROCERS), merchant: pick(GROCERS), amount: rand(34, 145) * (bad ? 1.3 : 1), type: 'debit', account: card(), category: 'Groceries' });
    for (let i = 0; i < Math.round(randInt(6, 9) * mult); i++) await addTx({ date: D(m, day(randInt(1, 28))), desc: pick(DINING), merchant: pick(DINING), amount: rand(9, 65), type: 'debit', account: card(), category: 'Food & Dining' });
    for (let i = 0; i < Math.round(randInt(2, 4) * mult); i++) await addTx({ date: D(m, day(randInt(1, 28))), desc: pick(SHOPPING), merchant: pick(SHOPPING), amount: rand(18, 220) * (bad ? 1.4 : 1), type: 'debit', account: card(), category: 'Shopping' });
    for (let i = 0; i < randInt(2, 4); i++) await addTx({ date: D(m, day(randInt(1, 28))), desc: pick(['SHELL OIL', 'CHEVRON', 'EXXONMOBIL']), merchant: 'Gas', amount: rand(34, 62), type: 'debit', account: card(), category: 'Transportation' });

    // Bad months: two big hits so the month clearly runs negative.
    if (bad) {
      for (let k = 0; k < 2; k++) {
        const b = pick(BIG);
        await addTx({ date: D(m, day(randInt(5, 24))), desc: b.desc, merchant: b.merchant, amount: rand(b.lo, b.hi), type: 'debit', account: card(), category: b.category });
      }
    } else {
      // Good months: set some aside into savings.
      await addTx({ date: D(m, day(16)), desc: 'ONLINE TRANSFER TO WAY2SAVE SAVINGS', merchant: 'Internal Transfer', amount: rand(300, 600), type: 'debit', account: 'Everyday Checking', category: 'Savings' });
    }

    // A couple of Unknown (uncategorized) rows so the red/green + "Unknown" show up.
    for (let i = 0; i < randInt(1, 3); i++) await addTx({ date: D(m, day(randInt(1, 27))), desc: pick(['SQ *CORNER MARKET', 'PAYPAL *MISC', 'POS PURCHASE 8842']), merchant: 'Unknown vendor', amount: rand(12, 95), type: 'debit', account: card(), category: 'Unknown' });
    if (chance(0.4)) await addTx({ date: D(m, day(randInt(1, 27))), desc: 'VENMO CASHOUT', merchant: 'Venmo', amount: rand(20, 150), type: 'credit', account: 'Everyday Checking', category: 'Unknown' });
  }

  console.log(`Inserted ${n} demo transactions for Jul–Dec 2026 (good: Jul/Sep/Nov, bad: Aug/Oct/Dec).`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
