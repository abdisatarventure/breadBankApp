import { Router, Response } from 'express';
import { getPool, sql } from '../config/db';
import { AuthRequest } from '../middleware/auth';

const router = Router();

type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

// Cadence bands keyed off the median gap (in days) between consecutive charges.
// `monthlyFactor` normalizes a single charge to a monthly cost so totals are
// comparable across cadences. `minOcc` is how many charges we need before we
// trust the pattern.
const BANDS: { cadence: Cadence; lo: number; hi: number; period: number; minOcc: number; monthlyFactor: number }[] = [
  { cadence: 'weekly',    lo: 5,   hi: 9,   period: 7,   minOcc: 4, monthlyFactor: 52 / 12 },
  { cadence: 'biweekly',  lo: 12,  hi: 18,  period: 14,  minOcc: 3, monthlyFactor: 26 / 12 },
  { cadence: 'monthly',   lo: 25,  hi: 38,  period: 30,  minOcc: 3, monthlyFactor: 1 },
  { cadence: 'quarterly', lo: 80,  hi: 100, period: 91,  minOcc: 3, monthlyFactor: 1 / 3 },
  { cadence: 'yearly',    lo: 330, hi: 400, period: 365, minOcc: 2, monthlyFactor: 1 / 12 },
];

// Card statements bury a unique reference code in the merchant string, e.g.
// "AMAZON PRIME*X50319W53 AMZN.CO". Strip those ref codes and trailing domains
// so identical recurring charges collapse to one merchant ("AMAZON PRIME")
// instead of scattering into many one-off groups that never look recurring.
function normalizeMerchant(raw: string): string {
  const tokens = raw.replace(/\*/g, ' ').split(/\s+/).filter(Boolean);
  const kept = tokens.filter((tok) => {
    const up = tok.toUpperCase();
    if (/\.(CO|COM|NET|ORG|IO)$/.test(up)) return false; // trailing domain
    const digits = (tok.match(/\d/g) ?? []).length;
    const hasLetter = /[A-Za-z]/.test(tok);
    const isUpper = tok === up && /[A-Z]/.test(tok);
    // Reference codes: all-caps alphanumeric blobs (>=2 digits, >=6 chars).
    if (isUpper && hasLetter && digits >= 2 && tok.length >= 6) return false;
    return true;
  });
  return kept.join(' ').trim() || raw.trim();
}

// Prettify an ALL-CAPS descriptor ("AMAZON PRIME" -> "Amazon Prime") while
// leaving already-cased names ("Verizon Wireless", "GitHub") untouched.
function prettifyMerchant(s: string): string {
  return s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

// Share of values within `tol` (fractional) of the reference value.
function shareWithin(values: number[], ref: number, tol: number): number {
  if (values.length === 0 || ref === 0) return 0;
  const hits = values.filter((v) => Math.abs(v - ref) / ref <= tol).length;
  return hits / values.length;
}

interface Charge { date: Date; amount: number }

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await getPool().request()
      .input('userId', sql.Int, req.userId)
      .query(`
        SELECT t.merchant, t.amount, t.date,
               c.name AS category, c.color AS category_color
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = @userId
          AND t.type = 'debit'
          AND t.merchant IS NOT NULL AND LTRIM(RTRIM(t.merchant)) <> ''
          AND t.date >= DATEADD(MONTH, -13, CAST(GETDATE() AS DATE))
          AND ISNULL(c.name, '') <> 'Transfer'
        ORDER BY t.merchant, t.date
      `);

    type Row = { merchant: string; amount: number; date: Date; category: string | null; category_color: string | null };
    const rows = result.recordset as Row[];

    // Bucket charges by normalized merchant (case-insensitive key, pretty display).
    const byMerchant = new Map<string, { display: string; charges: Charge[]; category: string | null; color: string | null; tagged: boolean }>();
    for (const r of rows) {
      const normalized = normalizeMerchant(r.merchant);
      const key = normalized.toUpperCase();
      let entry = byMerchant.get(key);
      if (!entry) {
        entry = { display: prettifyMerchant(normalized), charges: [], category: r.category, color: r.category_color, tagged: false };
        byMerchant.set(key, entry);
      }
      // A merchant the user explicitly filed under "Subscriptions" should always
      // surface, even if its timing/amount is too irregular for auto-detection.
      if ((r.category ?? '').toLowerCase() === 'subscriptions') {
        entry.tagged = true;
        entry.category = r.category;
        entry.color = r.category_color;
      }
      entry.charges.push({ date: new Date(r.date), amount: r.amount });
    }

    const subscriptions = [] as {
      merchant: string;
      cadence: Cadence;
      averageAmount: number;
      lastAmount: number;
      monthlyCost: number;
      occurrences: number;
      lastChargeDate: string;
      nextEstimatedDate: string;
      category: string | null;
      categoryColor: string | null;
      confidence: 'high' | 'medium';
    }[];

    for (const { display: merchant, charges, category, color, tagged } of byMerchant.values()) {
      if (charges.length === 0) continue;
      charges.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Collapse same-day duplicate charges to a single occurrence so a one-off
      // double-swipe doesn't masquerade as a tight cadence.
      const daily: Charge[] = [];
      for (const ch of charges) {
        const prev = daily[daily.length - 1];
        if (prev && Math.round((ch.date.getTime() - prev.date.getTime()) / 86_400_000) === 0) continue;
        daily.push(ch);
      }

      const gaps: number[] = [];
      for (let i = 1; i < daily.length; i++) {
        gaps.push(Math.round((daily[i]!.date.getTime() - daily[i - 1]!.date.getTime()) / 86_400_000));
      }
      const medianGap = median(gaps);
      const band = BANDS.find((b) => medianGap >= b.lo && medianGap <= b.hi);

      const amounts = daily.map((c) => c.amount);
      const medAmount = median(amounts);

      // Auto-detection: a real subscription bills a consistent amount on a
      // consistent cadence. Groceries/gas vary in amount; they get filtered here.
      // With only 2 charges (e.g. an annual bill) we demand a near-exact amount
      // match so a pair of coincidentally-similar purchases isn't mistaken for a
      // subscription.
      const amountTol = daily.length >= 3 ? 0.12 : 0.05;
      const amountMinShare = daily.length >= 3 ? 0.7 : 1;
      const amountConsistent = shareWithin(amounts, medAmount, amountTol) >= amountMinShare;
      const cadenceConsistent = shareWithin(gaps, medianGap, 0.35) >= 0.6;
      const detected = daily.length >= 2 && !!band && daily.length >= band.minOcc
        && amountConsistent && cadenceConsistent;

      // Include if auto-detected OR the user filed it under "Subscriptions".
      if (!detected && !tagged) continue;

      // Cadence/period: trust the band only when we actually auto-detected a
      // clean pattern. For category-tagged-but-irregular charges (e.g. sporadic
      // App Store buys) assume monthly rather than reporting a noisy cadence.
      const period = detected ? band!.period : 30;
      const monthlyFactor = detected ? band!.monthlyFactor : 1;
      const cadence: Cadence = detected ? band!.cadence : 'monthly';

      const last = daily[daily.length - 1]!;

      // "Active" = still charging. Drop anything whose most recent charge is
      // older than ~1.5 of its own billing cycles — a service cancelled months
      // ago, or a recurring merchant from a prior-year backfill (e.g. 2025), is
      // not a CURRENT subscription. This keeps the list to what you pay now.
      const daysSinceLast = Math.round((Date.now() - last.date.getTime()) / 86_400_000);
      const activeWindow = Math.max(period * 1.5, 45);
      if (daysSinceLast > activeWindow) continue;

      const nextEstimated = new Date(last.date);
      nextEstimated.setDate(nextEstimated.getDate() + period);

      const strongCadence = shareWithin(gaps, medianGap, 0.2) >= 0.7;
      const strongAmount = shareWithin(amounts, medAmount, 0.1) >= 0.7;

      subscriptions.push({
        merchant,
        cadence,
        averageAmount: Math.round(medAmount * 100) / 100,
        lastAmount: Math.round(last.amount * 100) / 100,
        monthlyCost: Math.round(medAmount * monthlyFactor * 100) / 100,
        occurrences: daily.length,
        lastChargeDate: last.date.toISOString().slice(0, 10),
        nextEstimatedDate: nextEstimated.toISOString().slice(0, 10),
        category,
        categoryColor: color,
        confidence: detected && strongCadence && strongAmount && daily.length >= (band!.minOcc + 1) ? 'high' : 'medium',
      });
    }

    subscriptions.sort((a, b) => b.monthlyCost - a.monthlyCost);

    const totalMonthly = Math.round(subscriptions.reduce((s, x) => s + x.monthlyCost, 0) * 100) / 100;

    res.json({
      subscriptions,
      summary: {
        count: subscriptions.length,
        totalMonthly,
        totalYearly: Math.round(totalMonthly * 12 * 100) / 100,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to detect subscriptions' });
  }
});

export default router;
