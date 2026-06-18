import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getPool, sql } from '../config/db';
import { plaid, PLAID_CONFIGURED } from '../config/plaid';
import { decryptSecret } from '../config/crypto';
import { detectSubscriptions } from '../services/subscriptionsService';

const router = Router();

export interface Bill {
  id: string;
  source: 'subscription' | 'liability';
  name: string;
  amount: number;
  dueDate: string;                 // 'YYYY-MM-DD'
  status: 'paid' | 'upcoming';
  cadence?: string;
  category?: string | null;
  categoryColor?: string | null;
  accountName?: string | null;
}

const DAY = 86_400_000;
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
// Upcoming (and recently-paid, in-window) bills: recurring subscriptions projected
// across the window + credit-card payment due dates from Plaid (best-effort).
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const from = typeof req.query.from === 'string'
      ? parseLocal(req.query.from)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = typeof req.query.to === 'string'
      ? parseLocal(req.query.to)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const bills: Bill[] = [];

    // ── Recurring subscriptions → project each onto the window ──────────
    const subs = await detectSubscriptions(userId);
    for (const s of subs) {
      const period = Math.max(1, s.periodDays);
      let d = parseLocal(s.lastChargeDate);
      // Walk forward to the first occurrence within the window.
      while (d < from) d = addDays(d, period);
      while (d <= to) {
        bills.push({
          id: `sub:${s.merchant}:${isoLocal(d)}`,
          source: 'subscription',
          name: s.merchant,
          amount: s.averageAmount,
          dueDate: isoLocal(d),
          status: d < todayStart ? 'paid' : 'upcoming',
          cadence: s.cadence,
          category: s.category,
          categoryColor: s.categoryColor,
        });
        d = addDays(d, period);
      }
    }

    // ── Plaid credit-card payment due dates (best-effort) ──────────────
    if (PLAID_CONFIGURED) {
      try {
        const items = await getPool().request()
          .input('userId', sql.Int, userId)
          .query(`SELECT access_token, institution FROM plaid_items WHERE user_id = @userId`);
        for (const item of items.recordset as { access_token: string; institution: string }[]) {
          try {
            const resp = await plaid.liabilitiesGet({ access_token: decryptSecret(item.access_token) });
            const acctById = new Map(resp.data.accounts.map((a) => [a.account_id, a]));
            for (const c of resp.data.liabilities?.credit ?? []) {
              const due = c.next_payment_due_date; // 'YYYY-MM-DD' | null
              if (!due) continue;
              const dueD = parseLocal(due);
              if (dueD < from || dueD > to) continue;
              const acct = c.account_id ? acctById.get(c.account_id) : undefined;
              const amount = c.minimum_payment_amount
                ?? c.last_statement_balance
                ?? acct?.balances.current
                ?? 0;
              bills.push({
                id: `liab:${c.account_id ?? acct?.name ?? 'card'}:${due}`,
                source: 'liability',
                name: `${acct?.name ?? 'Credit card'} payment`,
                amount: Number(amount) || 0,
                dueDate: due,
                status: dueD < todayStart ? 'paid' : 'upcoming',
                accountName: acct?.name ?? item.institution,
              });
            }
          } catch {
            // Item doesn't support Liabilities / wasn't linked with it — skip.
            continue;
          }
        }
      } catch { /* non-fatal: calendar still works from subscriptions alone */ }
    }

    bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const weekEnd = addDays(todayStart, 7);
    let dueThisWeek = 0, dueThisWeekCount = 0, totalUpcoming = 0;
    for (const b of bills) {
      if (b.status !== 'upcoming') continue;
      totalUpcoming += b.amount;
      const d = parseLocal(b.dueDate);
      if (d >= todayStart && d < weekEnd) { dueThisWeek += b.amount; dueThisWeekCount++; }
    }

    res.json({
      bills,
      summary: {
        count: bills.length,
        totalUpcoming: Math.round(totalUpcoming * 100) / 100,
        dueThisWeek: Math.round(dueThisWeek * 100) / 100,
        dueThisWeekCount,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load bill calendar' });
  }
});

export default router;
