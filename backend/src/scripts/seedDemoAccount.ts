/**
 * Seed a self-contained DEMO account for showing the app off without exposing
 * real numbers. Creates user test@gmail.com (password "test123") with mock
 * accounts, ~18 months of transactions, recurring subscriptions/bills, savings
 * goals, contributions and budgets.
 *
 * Re-runnable: it wipes ONLY the demo user's own data first, never anyone else's.
 *
 *   cd backend && npx ts-node src/scripts/seedDemoAccount.ts
 *
 * The password is hashed here with the same bcrypt cost the app uses, so login
 * works even though "test123" is below the 8-char minimum the register endpoint
 * enforces (that check only runs at registration, not at login).
 */
import bcrypt from 'bcrypt';
import { connectDB, getPool, sql } from '../config/db';

const DEMO_EMAIL      = 'test@gmail.com';
const DEMO_PASSWORD   = 'test123';
const DEMO_NAME       = 'test';
const DEMO_SECURITY_Q = 'Favorite book';
const DEMO_SECURITY_A = 'test';
const BCRYPT_COST     = 12;

// Matches auth.ts so the security answer hashes identically.
const normalizeAnswer = (a: string) => a.trim().toLowerCase().replace(/\s+/g, ' ');

// Deterministic RNG so re-runs produce the same demo data.
let _seed = 987654321;
const rng = () => { _seed = (_seed * 1664525 + 1013904223) % 4294967296; return _seed / 4294967296; };
const rand = (lo: number, hi: number) => lo + rng() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));
const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;
const money = (n: number) => Math.round(n * 100) / 100;
const chance = (p: number) => rng() < p;

async function main() {
  await connectDB();
  const pool = getPool();

  // ── Resolve system category ids by name ─────────────────────────────
  const cats = await pool.request().query(`SELECT id, name FROM categories WHERE user_id IS NULL`);
  const catId: Record<string, number> = {};
  for (const c of cats.recordset as { id: number; name: string }[]) catId[c.name] = c.id;
  const cat = (n: string) => { const id = catId[n]; if (!id) throw new Error(`Missing system category: ${n}`); return id; };

  // ── Wipe any previous demo user (scoped strictly to that user) ───────
  const existing = await pool.request().input('email', sql.NVarChar(200), DEMO_EMAIL)
    .query(`SELECT id FROM users WHERE email = @email`);
  if (existing.recordset[0]) {
    const uid = (existing.recordset[0] as { id: number }).id;
    for (const t of ['savings_contributions', 'savings_goals', 'budgets', 'merchant_rules',
                     'transactions', 'uploads', 'ai_usage', 'app_settings']) {
      await pool.request().input('uid', sql.Int, uid).query(`DELETE FROM ${t} WHERE user_id = @uid`);
    }
    await pool.request().input('uid', sql.Int, uid).query(`DELETE FROM accounts WHERE user_id = @uid`);
    await pool.request().input('uid', sql.Int, uid).query(`DELETE FROM users WHERE id = @uid`);
    console.log(`Removed existing demo user #${uid} and its data.`);
  }

  // ── Create the user ──────────────────────────────────────────────────
  const pwHash  = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);
  const ansHash = await bcrypt.hash(normalizeAnswer(DEMO_SECURITY_A), BCRYPT_COST);
  const userRes = await pool.request()
    .input('email', sql.NVarChar(200), DEMO_EMAIL)
    .input('pw',    sql.NVarChar(200), pwHash)
    .input('name',  sql.NVarChar(100), DEMO_NAME)
    .input('q',     sql.NVarChar(300), DEMO_SECURITY_Q)
    .input('a',     sql.NVarChar(200), ansHash)
    .query(`INSERT INTO users (email, password, name, security_question, security_answer)
            OUTPUT INSERTED.id VALUES (@email, @pw, @name, @q, @a)`);
  const userId = (userRes.recordset[0] as { id: number }).id;
  console.log(`Created demo user #${userId} (${DEMO_EMAIL} / ${DEMO_PASSWORD}).`);

  // ── Accounts (current_balance drives the dashboard's balance cards) ──
  const accountDefs: { name: string; type: string; institution: string; balance: number }[] = [
    { name: 'Everyday Checking', type: 'checking',   institution: 'Wells Fargo', balance:  4250.00 },
    { name: 'Way2Save Savings',  type: 'savings',    institution: 'Wells Fargo', balance: 12500.00 },
    { name: 'Apple Card',        type: 'credit',     institution: 'Apple',       balance:   842.50 },
    { name: 'Discover Card',     type: 'credit',     institution: 'Discover',    balance:  1235.75 },
    { name: 'Robinhood',         type: 'investment', institution: 'Robinhood',   balance:  8400.00 },
    { name: 'Fidelity',          type: 'investment', institution: 'Fidelity',    balance: 15600.00 },
  ];
  const acctId: Record<string, number> = {};
  for (const a of accountDefs) {
    const r = await pool.request()
      .input('uid', sql.Int, userId)
      .input('name', sql.NVarChar(100), a.name)
      .input('type', sql.NVarChar(50), a.type)
      .input('inst', sql.NVarChar(100), a.institution)
      .input('bal', sql.Decimal(14, 2), a.balance)
      .query(`INSERT INTO accounts (user_id, name, type, institution, current_balance)
              OUTPUT INSERTED.id VALUES (@uid, @name, @type, @inst, @bal)`);
    acctId[a.name] = (r.recordset[0] as { id: number }).id;
  }
  console.log(`Created ${accountDefs.length} accounts.`);

  // ── Upload history rows (cosmetic, for the Upload page list) ─────────
  for (const f of [
    { acct: 'Everyday Checking', file: 'wells_fargo_checking_2026.csv', n: 142 },
    { acct: 'Apple Card',        file: 'apple_card_transactions.csv',   n: 211 },
    { acct: 'Discover Card',     file: 'discover_activity.csv',         n: 188 },
  ]) {
    await pool.request()
      .input('uid', sql.Int, userId)
      .input('aid', sql.Int, acctId[f.acct])
      .input('file', sql.NVarChar(500), f.file)
      .input('n', sql.Int, f.n)
      .query(`INSERT INTO uploads (user_id, account_id, filename, transaction_count, duplicate_count)
              VALUES (@uid, @aid, @file, @n, ${randInt(0, 9)})`);
  }

  // ── Transaction helper ───────────────────────────────────────────────
  let txCount = 0;
  const addTx = async (o: {
    date: Date; desc: string; merchant: string; amount: number;
    type: 'debit' | 'credit'; account: string; category: string; recurring?: boolean;
  }) => {
    await pool.request()
      .input('uid', sql.Int, userId)
      .input('aid', sql.Int, acctId[o.account])
      .input('date', sql.Date, o.date)
      .input('desc', sql.NVarChar(500), o.desc)
      .input('merch', sql.NVarChar(200), o.merchant)
      .input('amt', sql.Decimal(12, 2), money(o.amount))
      .input('type', sql.NVarChar(10), o.type)
      .input('cat', sql.Int, cat(o.category))
      .input('rec', sql.Bit, o.recurring ? 1 : 0)
      .query(`INSERT INTO transactions
                (user_id, account_id, date, description, merchant, amount, type, category_id, is_recurring, is_historical)
              VALUES (@uid, @aid, @date, @desc, @merch, @amt, @type, @cat, @rec, 0)`);
    txCount++;
  };

  const card = () => pick(['Apple Card', 'Discover Card']);
  const D = (y: number, m: number, day: number) => new Date(y, m - 1, day);

  // Recurring monthly charges → picked up by subscription/bill detection.
  const SUBSCRIPTIONS: { merchant: string; amount: number; category: string; account: string; day: number }[] = [
    { merchant: 'NETFLIX.COM',          amount: 15.99, category: 'Entertainment',    account: 'Apple Card',    day: 4  },
    { merchant: 'SPOTIFY USA',          amount: 11.99, category: 'Entertainment',    account: 'Apple Card',    day: 7  },
    { merchant: 'DISNEY PLUS',          amount: 13.99, category: 'Entertainment',    account: 'Discover Card', day: 9  },
    { merchant: 'APPLE ICLOUD+',        amount:  2.99, category: 'Subscriptions',    account: 'Apple Card',    day: 2  },
    { merchant: 'NYTIMES DIGITAL',      amount: 17.00, category: 'Subscriptions',    account: 'Discover Card', day: 12 },
    { merchant: 'ADOBE CREATIVE CLOUD', amount: 54.99, category: 'Subscriptions',    account: 'Apple Card',    day: 18 },
    { merchant: 'PLANET FITNESS',       amount: 24.99, category: 'Health & Medical', account: 'Discover Card', day: 15 },
    { merchant: 'AMAZON PRIME',         amount: 14.99, category: 'Subscriptions',    account: 'Apple Card',    day: 21 },
  ];

  // Recurring bills paid from checking.
  const BILLS: { merchant: string; amount: number; category: string; day: number; jitter?: number }[] = [
    { merchant: 'SUNSET RIDGE APARTMENTS', amount: 1750.00, category: 'Housing',        day: 1  },
    { merchant: 'XFINITY INTERNET',        amount:   79.99, category: 'Subscriptions',  day: 6  },
    { merchant: 'CITY POWER & LIGHT',      amount:   98.00, category: 'Housing',        day: 10, jitter: 35 },
    { merchant: 'AQUA WATER UTILITY',      amount:   42.00, category: 'Housing',        day: 11, jitter: 12 },
    { merchant: 'GEICO AUTO INSURANCE',    amount:  112.00, category: 'Transportation', day: 14 },
    { merchant: 'T-MOBILE WIRELESS',       amount:   70.00, category: 'Subscriptions',  day: 19 },
  ];

  const GROCERS  = ['WHOLE FOODS MARKET', "TRADER JOE'S", 'SAFEWAY', 'KROGER', 'COSTCO WHOLESALE'];
  const DINING   = ['CHIPOTLE', 'STARBUCKS', 'OLIVE GARDEN', 'DOORDASH', 'SHAKE SHACK', 'PANERA BREAD', 'CHICK-FIL-A', 'LOCAL THAI KITCHEN'];
  const SHOPPING = ['AMAZON.COM', 'TARGET', 'BEST BUY', 'NIKE.COM', 'IKEA', 'HOME DEPOT'];
  const GAS      = ['SHELL OIL', 'CHEVRON', 'EXXONMOBIL'];
  const HEALTH   = ['CVS PHARMACY', 'WALGREENS', 'ONE MEDICAL'];
  const PERSONAL = ['SUPERCUTS', 'SEPHORA', 'GREAT CLIPS'];
  const ENTAIN   = ['AMC THEATRES', 'STEAM GAMES', 'DAVE & BUSTERS'];
  const TRAVEL   = ['DELTA AIR LINES', 'MARRIOTT HOTELS', 'AIRBNB', 'HERTZ RENT-A-CAR'];

  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const curDay = now.getDate();

  // Iterate every month from Jan 2025 → current month.
  for (let y = 2025; y <= curY; y++) {
    const mEnd = y === curY ? curM : 12;
    for (let m = 1; m <= mEnd; m++) {
      const isCurrentMonth = y === curY && m === curM;
      const maxDay = isCurrentMonth ? curDay : new Date(y, m, 0).getDate();
      const dayIn = (d: number) => Math.min(d, maxDay);

      // Income — biweekly paycheck into checking.
      for (const payDay of [1, 15]) {
        if (payDay > maxDay) continue;
        await addTx({ date: D(y, m, payDay), desc: 'ACME CORP PAYROLL DIRECT DEP', merchant: 'ACME CORP PAYROLL',
          amount: rand(2380, 2460), type: 'credit', account: 'Everyday Checking', category: 'Income', recurring: true });
      }
      // Occasional side income.
      if (chance(0.25) && maxDay > 20) {
        await addTx({ date: D(y, m, randInt(18, Math.min(26, maxDay))), desc: 'STRIPE TRANSFER FREELANCE',
          merchant: 'STRIPE PAYOUT', amount: rand(250, 900), type: 'credit', account: 'Everyday Checking', category: 'Income' });
      }

      // Recurring bills (from checking).
      for (const b of BILLS) {
        if (b.day > maxDay) continue;
        const amt = b.jitter ? b.amount + rand(-b.jitter, b.jitter) : b.amount;
        await addTx({ date: D(y, m, b.day), desc: b.merchant, merchant: b.merchant, amount: amt,
          type: 'debit', account: 'Everyday Checking', category: b.category, recurring: true });
      }

      // Recurring subscriptions (on cards).
      for (const s of SUBSCRIPTIONS) {
        if (s.day > maxDay) continue;
        await addTx({ date: D(y, m, s.day), desc: `${s.merchant} SUBSCRIPTION`, merchant: s.merchant,
          amount: s.amount, type: 'debit', account: s.account, category: s.category, recurring: true });
      }

      // Groceries — 4–6 trips.
      for (let i = 0; i < randInt(4, 6); i++) {
        await addTx({ date: D(y, m, dayIn(randInt(2, 27))), desc: pick(GROCERS), merchant: pick(GROCERS),
          amount: rand(34, 145), type: 'debit', account: card(), category: 'Groceries' });
      }
      // Dining — 6–10.
      for (let i = 0; i < randInt(6, 10); i++) {
        await addTx({ date: D(y, m, dayIn(randInt(1, 28))), desc: pick(DINING), merchant: pick(DINING),
          amount: rand(8, 68), type: 'debit', account: card(), category: 'Food & Dining' });
      }
      // Transportation — gas + rideshare + parking (parking feeds the dashboard parking widget).
      for (let i = 0; i < randInt(2, 4); i++) {
        await addTx({ date: D(y, m, dayIn(randInt(1, 28))), desc: pick(GAS), merchant: pick(GAS),
          amount: rand(34, 62), type: 'debit', account: card(), category: 'Transportation' });
      }
      for (let i = 0; i < randInt(2, 5); i++) {
        await addTx({ date: D(y, m, dayIn(randInt(1, 28))), desc: 'METROPOLIS PARKING GARAGE', merchant: 'METROPOLIS PARKING',
          amount: rand(8, 26), type: 'debit', account: card(), category: 'Parking' });
      }
      if (chance(0.6)) {
        await addTx({ date: D(y, m, dayIn(randInt(1, 28))), desc: 'UBER TRIP', merchant: 'UBER',
          amount: rand(11, 38), type: 'debit', account: card(), category: 'Transportation' });
      }
      // Shopping — 2–4.
      for (let i = 0; i < randInt(2, 4); i++) {
        await addTx({ date: D(y, m, dayIn(randInt(1, 28))), desc: pick(SHOPPING), merchant: pick(SHOPPING),
          amount: rand(18, 220), type: 'debit', account: card(), category: 'Shopping' });
      }
      // Entertainment, health, personal care — occasional.
      if (chance(0.7)) await addTx({ date: D(y, m, dayIn(randInt(1, 28))), desc: pick(ENTAIN), merchant: pick(ENTAIN),
        amount: rand(14, 75), type: 'debit', account: card(), category: 'Entertainment' });
      if (chance(0.6)) await addTx({ date: D(y, m, dayIn(randInt(1, 28))), desc: pick(HEALTH), merchant: pick(HEALTH),
        amount: rand(12, 90), type: 'debit', account: card(), category: 'Health & Medical' });
      if (chance(0.5)) await addTx({ date: D(y, m, dayIn(randInt(1, 28))), desc: pick(PERSONAL), merchant: pick(PERSONAL),
        amount: rand(20, 85), type: 'debit', account: card(), category: 'Personal Care' });

      // Occasional travel splurge.
      if (chance(0.18)) await addTx({ date: D(y, m, dayIn(randInt(1, 26))), desc: pick(TRAVEL), merchant: pick(TRAVEL),
        amount: rand(180, 880), type: 'debit', account: card(), category: 'Travel' });

      // Occasional refund (credit to a spending category — exercises net-spend logic).
      if (chance(0.3)) await addTx({ date: D(y, m, dayIn(randInt(5, 26))), desc: 'AMAZON.COM REFUND', merchant: 'AMAZON.COM',
        amount: rand(15, 120), type: 'credit', account: card(), category: 'Shopping' });

      // Monthly credit-card payments (Transfer = excluded from spend/income).
      for (const c of ['Apple Card', 'Discover Card']) {
        const payDay = dayIn(randInt(20, 26));
        await addTx({ date: D(y, m, payDay), desc: `${c.toUpperCase()} AUTOPAY PAYMENT`, merchant: `${c} Payment`,
          amount: rand(350, 900), type: 'debit', account: 'Everyday Checking', category: 'Transfer' });
        await addTx({ date: D(y, m, payDay), desc: 'PAYMENT THANK YOU', merchant: `${c} Payment`,
          amount: rand(350, 900), type: 'credit', account: c, category: 'Transfer' });
      }

      // Monthly transfer to savings.
      if (maxDay >= 16) await addTx({ date: D(y, m, 16), desc: 'TRANSFER TO SAVINGS', merchant: 'Internal Transfer',
        amount: 400, type: 'debit', account: 'Everyday Checking', category: 'Transfer' });
    }
  }
  console.log(`Inserted ${txCount} transactions.`);

  // ── Savings goals + contributions ────────────────────────────────────
  const makeGoal = async (g: { name: string; target: number; date: string | null; icon: string; color: string; priority: number; reserve: boolean }) => {
    const r = await pool.request()
      .input('uid', sql.Int, userId)
      .input('name', sql.NVarChar(150), g.name)
      .input('target', sql.Decimal(12, 2), g.target)
      .input('date', sql.Date, g.date)
      .input('icon', sql.NVarChar(50), g.icon)
      .input('color', sql.NVarChar(20), g.color)
      .input('priority', sql.Int, g.priority)
      .input('reserve', sql.Bit, g.reserve ? 1 : 0)
      .query(`INSERT INTO savings_goals (user_id, name, target_amount, target_date, icon, color, priority, is_reserve)
              OUTPUT INSERTED.id VALUES (@uid, @name, @target, @date, @icon, @color, @priority, @reserve)`);
    return (r.recordset[0] as { id: number }).id;
  };
  const contribute = async (goalId: number, amount: number, monthKey: string) => {
    await pool.request()
      .input('uid', sql.Int, userId).input('gid', sql.Int, goalId)
      .input('amt', sql.Decimal(12, 2), amount).input('mk', sql.Char(7), monthKey)
      .query(`INSERT INTO savings_contributions (user_id, goal_id, amount, month_key)
              VALUES (@uid, @gid, @amt, @mk)`);
  };

  // Last 6 month keys (incl. current) for spreading contributions.
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(curY, curM - 1 - i, 1);
    monthKeys.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  }

  const reserveId = await makeGoal({ name: 'Safety Net', target: 10000, date: null, icon: 'savings', color: '#22C55E', priority: 100, reserve: true });
  const vacayId   = await makeGoal({ name: 'Japan Trip',  target: 4000, date: '2026-12-01', icon: 'flight',     color: '#F97316', priority: 3, reserve: false });
  const laptopId  = await makeGoal({ name: 'New MacBook', target: 2200, date: '2026-09-01', icon: 'laptop_mac', color: '#6C4ED4', priority: 2, reserve: false });
  const carId     = await makeGoal({ name: 'Car Down Payment', target: 6000, date: '2027-03-01', icon: 'directions_car', color: '#3B82F6', priority: 1, reserve: false });

  for (const mk of monthKeys) {
    await contribute(reserveId, money(rand(250, 380)), mk);
    await contribute(vacayId,   money(rand(120, 220)), mk);
    await contribute(laptopId,  money(rand(80, 160)),  mk);
    if (chance(0.7)) await contribute(carId, money(rand(100, 200)), mk);
  }
  console.log('Created 4 savings goals with 6 months of contributions.');

  // ── Budgets (monthly spending limits) ────────────────────────────────
  const BUDGETS: { category: string; limit: number }[] = [
    { category: 'Groceries', limit: 650 },
    { category: 'Food & Dining', limit: 450 },
    { category: 'Shopping', limit: 350 },
    { category: 'Entertainment', limit: 150 },
    { category: 'Transportation', limit: 250 },
    { category: 'Subscriptions', limit: 200 },
  ];
  for (const b of BUDGETS) {
    await pool.request()
      .input('uid', sql.Int, userId).input('cat', sql.Int, cat(b.category))
      .input('lim', sql.Decimal(12, 2), b.limit)
      .query(`INSERT INTO budgets (user_id, category_id, monthly_limit) VALUES (@uid, @cat, @lim)`);
  }
  console.log(`Created ${BUDGETS.length} category budgets.`);

  console.log('\n✅ Demo account ready.');
  console.log(`   Email:    ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}`);
  console.log(`   Security: "${DEMO_SECURITY_Q}" → ${DEMO_SECURITY_A}`);
  process.exit(0);
}

main().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
